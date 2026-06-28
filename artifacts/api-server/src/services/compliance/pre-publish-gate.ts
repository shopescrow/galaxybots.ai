import {
  db,
  assetsTable,
  assetComplianceChecksTable,
  assetLicenseRecordsTable,
  platformPolicyConfigsTable,
  type Asset,
  type FirewallDecision,
  type FirewallCheckItem,
  type FirewallReviewStatus,
  type PlatformPolicyConfig,
  type AssetLicenseRecord,
} from "@workspace/db";
import { and, eq, ne, desc } from "drizzle-orm";
import { WELL_KNOWN_TRADEMARKS, screenText } from "./trademark-list";

// ---------------------------------------------------------------------------
// Compliance & IP firewall — the pre-publish safety gate.
//
// Runs four screens against an asset before it can move to "published":
//   1. Per-platform AI-content policy fit
//   2. Originality / near-duplicate similarity vs the client's prior assets
//   3. Basic trademark / brand-name screening
//   4. Required AI-disclosure tagging
//
// Returns an aggregate pass / flag / block verdict with specific reasons,
// persists the run, and keeps a per-asset license/rights record in sync.
// ---------------------------------------------------------------------------

export interface FirewallGateResult {
  decision: FirewallDecision;
  reviewStatus: FirewallReviewStatus;
  reasons: string[];
  checks: FirewallCheckItem[];
  similarityScore: number | null;
  matchedAssetId: number | null;
  matchedAssetTitle: string | null;
}

// Default policy used when an operator has not configured one for a platform.
export const DEFAULT_POLICY = {
  strictness: "standard" as const,
  aiContentAllowed: true,
  disclosureRequired: true,
  similarityThreshold: 0.72,
  prohibitedKeywords: [] as string[],
};

// Strictness shifts the similarity thresholds and how trademark/keyword hits are
// graded. Strict treats more borderline cases as hard blocks.
function strictnessTuning(strictness: string): {
  flagDelta: number; // added to/subtracted from the configured flag threshold
  blockMargin: number; // similarity above (flag + margin) is a hard block
  keywordIsBlock: boolean; // prohibited keyword/trademark => block vs flag
} {
  switch (strictness) {
    case "lenient":
      return { flagDelta: 0.1, blockMargin: 0.18, keywordIsBlock: false };
    case "strict":
      return { flagDelta: -0.1, blockMargin: 0.1, keywordIsBlock: true };
    default:
      return { flagDelta: 0, blockMargin: 0.15, keywordIsBlock: false };
  }
}

export async function resolvePlatformPolicy(
  clientId: number,
  platform: string | null | undefined,
): Promise<{
  config: PlatformPolicyConfig | null;
  effective: typeof DEFAULT_POLICY;
}> {
  if (!platform) {
    return { config: null, effective: { ...DEFAULT_POLICY } };
  }
  const [config] = await db
    .select()
    .from(platformPolicyConfigsTable)
    .where(
      and(
        eq(platformPolicyConfigsTable.clientId, clientId),
        eq(platformPolicyConfigsTable.platform, platform),
      ),
    );
  if (!config) return { config: null, effective: { ...DEFAULT_POLICY } };
  return {
    config,
    effective: {
      strictness: (config.strictness as typeof DEFAULT_POLICY.strictness) ?? "standard",
      aiContentAllowed: config.aiContentAllowed,
      disclosureRequired: config.disclosureRequired,
      similarityThreshold: Number(config.similarityThreshold) || DEFAULT_POLICY.similarityThreshold,
      prohibitedKeywords: config.prohibitedKeywords ?? [],
    },
  };
}

// --- Originality / similarity ----------------------------------------------

function tokenize(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function assetCorpus(a: {
  title: string;
  description?: string | null;
  niche?: string | null;
}): string {
  return [a.title, a.description ?? "", a.niche ?? ""].join(" ");
}

async function checkOriginality(
  asset: Asset,
): Promise<{
  score: number;
  matchedAssetId: number | null;
  matchedAssetTitle: string | null;
}> {
  const priors = await db
    .select({
      id: assetsTable.id,
      title: assetsTable.title,
      description: assetsTable.description,
      niche: assetsTable.niche,
    })
    .from(assetsTable)
    .where(
      and(
        eq(assetsTable.clientId, asset.clientId),
        ne(assetsTable.id, asset.id),
      ),
    )
    .limit(500);

  const self = tokenize(assetCorpus(asset));
  let best = 0;
  let matchedId: number | null = null;
  let matchedTitle: string | null = null;
  for (const p of priors) {
    const score = jaccard(self, tokenize(assetCorpus(p)));
    if (score > best) {
      best = score;
      matchedId = p.id;
      matchedTitle = p.title;
    }
  }
  return { score: best, matchedAssetId: matchedId, matchedAssetTitle: matchedTitle };
}

// --- The gate ---------------------------------------------------------------

export async function evaluateAsset(params: {
  asset: Asset;
  license: AssetLicenseRecord | null;
  effective: typeof DEFAULT_POLICY;
}): Promise<FirewallGateResult> {
  const { asset, license, effective } = params;
  const tuning = strictnessTuning(effective.strictness);
  const checks: FirewallCheckItem[] = [];
  const reasons: string[] = [];

  const aiGenerated = license?.aiGenerated ?? true;
  const corpus = assetCorpus(asset);

  // 1. Per-platform AI-content policy fit ------------------------------------
  if (aiGenerated && !effective.aiContentAllowed) {
    const reason = `Target platform "${asset.targetPlatform}" does not permit AI-generated content.`;
    checks.push({ name: "AI-content policy fit", category: "policy", status: "block", reason });
    reasons.push(reason);
  } else {
    checks.push({
      name: "AI-content policy fit",
      category: "policy",
      status: "pass",
      reason: effective.aiContentAllowed
        ? "Platform permits AI-generated content."
        : "Asset is not flagged as AI-generated.",
    });
  }

  // Operator-defined prohibited keywords (per platform).
  const keywordHits = screenText(corpus, effective.prohibitedKeywords);
  if (keywordHits.length > 0) {
    const status: FirewallDecision = tuning.keywordIsBlock ? "block" : "flag";
    const reason = `Contains platform-prohibited keyword(s): ${keywordHits.join(", ")}.`;
    checks.push({ name: "Prohibited keywords", category: "policy", status, reason, detail: { keywordHits } });
    reasons.push(reason);
  }

  // 2. Originality / similarity ----------------------------------------------
  const originality = await checkOriginality(asset);
  const flagThreshold = Math.max(0, Math.min(1, effective.similarityThreshold + tuning.flagDelta));
  const blockThreshold = Math.min(1, flagThreshold + tuning.blockMargin);
  if (originality.score >= blockThreshold) {
    const reason = `Near-identical to existing asset "${originality.matchedAssetTitle}" (${Math.round(
      originality.score * 100,
    )}% similar) — likely duplicate/infringing.`;
    checks.push({
      name: "Originality / similarity",
      category: "originality",
      status: "block",
      reason,
      detail: { score: originality.score, matchedAssetId: originality.matchedAssetId },
    });
    reasons.push(reason);
  } else if (originality.score >= flagThreshold) {
    const reason = `High similarity to existing asset "${originality.matchedAssetTitle}" (${Math.round(
      originality.score * 100,
    )}% similar) — review for originality.`;
    checks.push({
      name: "Originality / similarity",
      category: "originality",
      status: "flag",
      reason,
      detail: { score: originality.score, matchedAssetId: originality.matchedAssetId },
    });
    reasons.push(reason);
  } else {
    checks.push({
      name: "Originality / similarity",
      category: "originality",
      status: "pass",
      reason: `No near-duplicate found (peak ${Math.round(originality.score * 100)}% similar).`,
      detail: { score: originality.score },
    });
  }

  // 3. Trademark / brand-name screening --------------------------------------
  const tmHits = screenText(corpus, WELL_KNOWN_TRADEMARKS);
  if (tmHits.length > 0) {
    const status: FirewallDecision = tuning.keywordIsBlock ? "block" : "flag";
    const reason = `Possible trademark/brand reference(s): ${tmHits.join(", ")} — verify rights before selling.`;
    checks.push({ name: "Trademark screening", category: "trademark", status, reason, detail: { tmHits } });
    reasons.push(reason);
  } else {
    checks.push({
      name: "Trademark screening",
      category: "trademark",
      status: "pass",
      reason: "No well-known trademarks detected in title/description.",
    });
  }

  // 4. AI-disclosure tagging --------------------------------------------------
  const disclosureNeeded = effective.disclosureRequired && aiGenerated;
  const disclosureTagged =
    license?.disclosureState === "tagged" && Boolean(license?.disclosureText?.trim());
  if (disclosureNeeded && !disclosureTagged) {
    const reason =
      "AI-generated content requires a disclosure tag for this platform, but none is recorded.";
    checks.push({ name: "AI-disclosure", category: "disclosure", status: "flag", reason });
    reasons.push(reason);
  } else {
    checks.push({
      name: "AI-disclosure",
      category: "disclosure",
      status: "pass",
      reason: disclosureNeeded
        ? "AI-disclosure tag present."
        : "AI-disclosure not required for this asset/platform.",
    });
  }

  // Aggregate verdict ---------------------------------------------------------
  const decision: FirewallDecision = checks.some((c) => c.status === "block")
    ? "block"
    : checks.some((c) => c.status === "flag")
      ? "flag"
      : "pass";

  const reviewStatus: FirewallReviewStatus =
    decision === "block" ? "blocked" : decision === "flag" ? "pending_review" : "auto_passed";

  return {
    decision,
    reviewStatus,
    reasons,
    checks,
    similarityScore: originality.score,
    matchedAssetId: originality.matchedAssetId,
    matchedAssetTitle: originality.matchedAssetTitle,
  };
}

// Ensure an asset has a license/rights record; create a sensible default if not.
export async function ensureLicenseRecord(
  asset: Asset,
): Promise<AssetLicenseRecord> {
  const [existing] = await db
    .select()
    .from(assetLicenseRecordsTable)
    .where(eq(assetLicenseRecordsTable.assetId, asset.id));
  if (existing) return existing;

  const [created] = await db
    .insert(assetLicenseRecordsTable)
    .values({
      assetId: asset.id,
      clientId: asset.clientId,
      aiGenerated: true,
      sourcesUsed: [],
      usageRights: null,
      disclosureState: "required",
      disclosureText: null,
    })
    .returning();
  return created;
}

// Run the full gate against an asset, persist the check, and return the result
// plus the stored check id.
export async function runPrePublishGate(params: {
  asset: Asset;
  triggeredBy: string;
}): Promise<FirewallGateResult & { checkId: number }> {
  const { asset, triggeredBy } = params;
  const license = await ensureLicenseRecord(asset);
  const { effective } = await resolvePlatformPolicy(asset.clientId, asset.targetPlatform);
  const result = await evaluateAsset({ asset, license, effective });

  const [check] = await db
    .insert(assetComplianceChecksTable)
    .values({
      assetId: asset.id,
      clientId: asset.clientId,
      targetPlatform: asset.targetPlatform ?? null,
      decision: result.decision,
      reviewStatus: result.reviewStatus,
      checks: result.checks,
      reasons: result.reasons,
      similarityScore:
        result.similarityScore != null ? String(result.similarityScore) : null,
      matchedAssetId: result.matchedAssetId,
      matchedAssetTitle: result.matchedAssetTitle,
      triggeredBy,
    })
    .returning();

  return { ...result, checkId: check.id };
}

// Latest check for an asset (for surfacing in the Asset Studio / firewall UI).
export async function getLatestCheck(assetId: number, clientId: number) {
  const [latest] = await db
    .select()
    .from(assetComplianceChecksTable)
    .where(
      and(
        eq(assetComplianceChecksTable.assetId, assetId),
        eq(assetComplianceChecksTable.clientId, clientId),
      ),
    )
    .orderBy(desc(assetComplianceChecksTable.createdAt))
    .limit(1);
  return latest ?? null;
}
