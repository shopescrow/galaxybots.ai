import {
  type Asset,
  type AssetFile,
  type AssetComplianceStatus,
  ASSET_COMPLIANCE_STATUSES,
} from "@workspace/db";

// A single explainable contribution to an asset's confidence score.
export interface ConfidenceFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface AssetConfidence {
  // 0-100 integer, clamped.
  score: number;
  factors: ConfidenceFactor[];
  complianceStatus: AssetComplianceStatus;
  complianceIssues: string[];
}

// Minimal shape we read from the asset's stored compliance result. The result
// itself is produced by the Compliance & IP Firewall task; here we only consume
// whatever it has written to `asset.metadata.compliance`.
interface StoredCompliance {
  status?: string;
  issues?: unknown;
}

export function readComplianceFromAsset(asset: Pick<Asset, "metadata">): {
  status: AssetComplianceStatus;
  issues: string[];
} {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const raw = (meta.compliance ?? {}) as StoredCompliance;
  const status =
    typeof raw.status === "string" &&
    (ASSET_COMPLIANCE_STATUSES as readonly string[]).includes(raw.status)
      ? (raw.status as AssetComplianceStatus)
      : "pending";
  const issues = Array.isArray(raw.issues)
    ? raw.issues.filter((i): i is string => typeof i === "string")
    : [];
  return { status, issues };
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * Compute a deterministic, explainable 0-100 confidence score for an asset.
 *
 * The score combines completeness signals (the more an asset is fully specified
 * and has produced artifacts, the more we trust auto-publishing it), review
 * maturity (it has progressed through the lifecycle), and the compliance verdict
 * supplied by the compliance subsystem. A failing compliance verdict caps the
 * score hard so a risky asset can never cross an autonomy threshold.
 */
export function computeAssetConfidence(
  asset: Pick<
    Asset,
    | "description"
    | "niche"
    | "targetPlatform"
    | "type"
    | "statusHistory"
    | "metadata"
    | "botId"
  >,
  files: Pick<AssetFile, "id">[],
): AssetConfidence {
  const { status: complianceStatus, issues: complianceIssues } =
    readComplianceFromAsset(asset);

  const factors: ConfidenceFactor[] = [];

  // 1. Completeness of the asset definition (max 35).
  let completeness = 0;
  const completeMax = 35;
  if (asset.description && asset.description.trim().length >= 40)
    completeness += 12;
  else if (asset.description && asset.description.trim().length > 0)
    completeness += 6;
  if (asset.niche && asset.niche.trim().length > 0) completeness += 8;
  if (asset.targetPlatform && asset.targetPlatform.trim().length > 0)
    completeness += 8;
  if (asset.botId) completeness += 7;
  factors.push({
    key: "completeness",
    label: "Definition completeness",
    points: completeness,
    max: completeMax,
    detail: "Description, niche, target platform, and producing bot are set.",
  });

  // 2. Produced artifacts (max 20). An asset with attached files is far more
  //    likely to be genuinely shippable.
  const fileCount = files.length;
  const artifactPoints = fileCount === 0 ? 0 : fileCount === 1 ? 12 : 20;
  factors.push({
    key: "artifacts",
    label: "Produced artifacts",
    points: artifactPoints,
    max: 20,
    detail:
      fileCount === 0
        ? "No files attached yet."
        : `${fileCount} file${fileCount === 1 ? "" : "s"} attached.`,
  });

  // 3. Review maturity (max 15). Progression through the lifecycle.
  const history = asset.statusHistory ?? [];
  const reachedReview = history.some((h) => h.status === "in_review");
  const reachedDraft = history.some((h) => h.status === "draft");
  const maturity = reachedReview ? 15 : reachedDraft ? 8 : 0;
  factors.push({
    key: "maturity",
    label: "Review maturity",
    points: maturity,
    max: 15,
    detail: reachedReview
      ? "Asset has advanced to review."
      : reachedDraft
        ? "Asset reached draft stage."
        : "Still an early idea.",
  });

  // 4. Compliance verdict (max 30). This is the dominant safety signal.
  let compliancePoints = 0;
  let complianceDetail = "";
  switch (complianceStatus) {
    case "pass":
      compliancePoints = 30;
      complianceDetail = "Compliance checks passed.";
      break;
    case "pending":
      compliancePoints = 12;
      complianceDetail = "Compliance checks have not run yet.";
      break;
    case "review":
      compliancePoints = 4;
      complianceDetail = "Compliance needs human review.";
      break;
    case "fail":
      compliancePoints = 0;
      complianceDetail = "Compliance checks failed.";
      break;
  }
  factors.push({
    key: "compliance",
    label: "Compliance verdict",
    points: compliancePoints,
    max: 30,
    detail: complianceDetail,
  });

  let score = factors.reduce((sum, f) => sum + f.points, 0);

  // Hard cap: anything not cleanly passing compliance can never read as
  // high-confidence, so it cannot satisfy an autonomy threshold by accident.
  if (complianceStatus === "fail") score = Math.min(score, 20);
  else if (complianceStatus === "review") score = Math.min(score, 45);

  return {
    score: clamp(Math.round(score), 0, 100),
    factors,
    complianceStatus,
    complianceIssues,
  };
}
