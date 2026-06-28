import {
  db,
  assetAutonomyConfigsTable,
  AUTONOMY_SCOPE_ANY,
  type AssetAutonomyConfig,
  type AssetComplianceStatus,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AutonomyDecision {
  eligible: boolean;
  reason: string;
  config: AssetAutonomyConfig | null;
  thresholdUsed: number | null;
}

// Specificity ranking: an exact type+platform rule beats a type-only rule,
// which beats a platform-only rule, which beats the global default.
function specificity(c: AssetAutonomyConfig): number {
  const typeSpecific = c.assetType !== AUTONOMY_SCOPE_ANY;
  const platformSpecific = c.targetPlatform !== AUTONOMY_SCOPE_ANY;
  return (typeSpecific ? 2 : 0) + (platformSpecific ? 1 : 0);
}

/**
 * Resolve the most specific autonomy config that applies to a given asset
 * type / target platform for a client. Returns null when no rule matches.
 */
export function resolveAutonomyConfig(
  configs: AssetAutonomyConfig[],
  assetType: string,
  targetPlatform: string | null,
): AssetAutonomyConfig | null {
  const platform = targetPlatform ?? AUTONOMY_SCOPE_ANY;
  const matches = configs.filter(
    (c) =>
      (c.assetType === AUTONOMY_SCOPE_ANY || c.assetType === assetType) &&
      (c.targetPlatform === AUTONOMY_SCOPE_ANY ||
        c.targetPlatform === platform),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => specificity(b) - specificity(a));
  return matches[0];
}

export async function loadAutonomyConfigs(
  clientId: number,
): Promise<AssetAutonomyConfig[]> {
  return db
    .select()
    .from(assetAutonomyConfigsTable)
    .where(eq(assetAutonomyConfigsTable.clientId, clientId));
}

/**
 * Decide whether an asset may auto-publish given its confidence score, the
 * compliance verdict, and the resolved autonomy config.
 */
export function evaluateAutonomy(args: {
  config: AssetAutonomyConfig | null;
  confidenceScore: number;
  complianceStatus: AssetComplianceStatus;
}): AutonomyDecision {
  const { config, confidenceScore, complianceStatus } = args;

  if (!config || !config.autoPublishEnabled) {
    return {
      eligible: false,
      reason: "Auto-publish is not enabled for this asset type/platform.",
      config: config ?? null,
      thresholdUsed: config?.confidenceThreshold ?? null,
    };
  }

  // Compliance is a hard gate regardless of confidence.
  if (complianceStatus === "fail" || complianceStatus === "review") {
    return {
      eligible: false,
      reason: `Compliance status "${complianceStatus}" blocks auto-publish.`,
      config,
      thresholdUsed: config.confidenceThreshold,
    };
  }
  if (config.requireCompliancePass && complianceStatus !== "pass") {
    return {
      eligible: false,
      reason: "Compliance must be passing to auto-publish.",
      config,
      thresholdUsed: config.confidenceThreshold,
    };
  }

  if (confidenceScore < config.confidenceThreshold) {
    return {
      eligible: false,
      reason: `Confidence ${confidenceScore} is below threshold ${config.confidenceThreshold}.`,
      config,
      thresholdUsed: config.confidenceThreshold,
    };
  }

  return {
    eligible: true,
    reason: `Confidence ${confidenceScore} ≥ threshold ${config.confidenceThreshold} and compliance is acceptable.`,
    config,
    thresholdUsed: config.confidenceThreshold,
  };
}
