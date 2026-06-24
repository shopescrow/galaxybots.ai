import { writeAuditEntry } from "../audit/audit-ledger.js";
import type { JointCoordinationPlan } from "./joint-coordination-plan.js";

export type SampleCountMap = Map<string, number>;

export interface ConfidenceScore {
  total: number;
  sampleConfidence: number;
  versionConfidence: number;
  beliefConfidence: number;
  breakdown: {
    minSampleCount: number;
    modelVersionMatch: boolean;
    beliefSuppressionCount: number;
    availableBotCount: number;
  };
}

export function computeConfidenceScore(
  sampleCounts: SampleCountMap,
  modelVersionMatch: boolean,
  beliefSuppressionCount: number,
  availableBotCount: number,
): ConfidenceScore {
  const counts = Array.from(sampleCounts.values());
  const minCount = counts.length > 0 ? Math.min(...counts) : 0;

  const sampleConfidence = Math.min(minCount / 50, 1) * 40;
  const versionConfidence = modelVersionMatch ? 30 : 10;
  const rawBeliefConfidence = availableBotCount > 0
    ? (1 - beliefSuppressionCount / availableBotCount) * 30
    : 30;
  const beliefConfidence = Math.max(0, Math.min(rawBeliefConfidence, 30));

  const total = Math.round(sampleConfidence + versionConfidence + beliefConfidence);

  return {
    total,
    sampleConfidence: Math.round(sampleConfidence),
    versionConfidence,
    beliefConfidence: Math.round(beliefConfidence),
    breakdown: {
      minSampleCount: minCount,
      modelVersionMatch,
      beliefSuppressionCount,
      availableBotCount,
    },
  };
}

export async function scoreJointPlan(
  plan: JointCoordinationPlan,
  sampleCounts: SampleCountMap,
  modelVersionMatch: boolean,
  beliefSuppressionCount: number,
  sessionId?: string,
  clientId?: number,
  pipelineRunId?: string,
): Promise<ConfidenceScore> {
  const availableBotCount = plan.roleAssignments.length;
  const score = computeConfidenceScore(sampleCounts, modelVersionMatch, beliefSuppressionCount, availableBotCount);

  writeAuditEntry({
    clientId: clientId ?? null,
    sessionId: sessionId ?? null,
    pipelineRunId: pipelineRunId ?? null,
    engine: "coordinator",
    decisionType: "confidence_score",
    outcomeQualityScore: score.total / 100,
    payload: {
      score: score.total,
      breakdown: score.breakdown,
      strategy: plan.communicationStrategy,
      taskCategory: plan.taskCategory,
      sessionId,
      pipelineRunId,
    },
  }).catch(() => {});

  return score;
}
