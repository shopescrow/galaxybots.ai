import {
  db,
  botCapabilityModelTable,
  botReflectionsTable,
  practiceRunsTable,
  knowledgeTransfersTable,
  selfModificationsTable,
  selfActualizationMetricsTable,
  type SelfActualizationMetric,
} from "@workspace/db";
import { and, gte, desc, eq, sql } from "drizzle-orm";
import { isKillSwitchActive } from "./config";

// ---------------------------------------------------------------------------
// Telemetry for the self-actualization engine. Each cycle emits a snapshot of
// fleet competence/confidence/trend plus counts of reflections, practice gains,
// transfers and self-modification lifecycle events, so the console can show the
// learning system's health and guardrails can be audited over time.
// ---------------------------------------------------------------------------

export interface SelfActualizationSnapshot {
  avgCompetence: number;
  avgConfidence: number;
  avgTrend: number;
  reflections: number;
  practiceRuns: number;
  practiceAdopted: number;
  practiceGainAvg: number;
  transfers: number;
  transfersApplied: number;
  modsProposed: number;
  modsPromoted: number;
  modsRolledBack: number;
  blockedPromotions: number;
  killSwitchActive: boolean;
}

/**
 * Compute and persist a telemetry snapshot for the trailing window.
 */
export async function emitSelfActualizationMetrics(
  windowHours = 24,
): Promise<SelfActualizationMetric> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - windowHours * 60 * 60 * 1000);

  const [capAgg] = await db
    .select({
      avgCompetence: sql<number>`COALESCE(AVG(${botCapabilityModelTable.competence}), 0)`,
      avgConfidence: sql<number>`COALESCE(AVG(${botCapabilityModelTable.confidence}), 0)`,
      avgTrend: sql<number>`COALESCE(AVG(${botCapabilityModelTable.trend}), 0)`,
    })
    .from(botCapabilityModelTable);

  const [reflAgg] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(botReflectionsTable)
    .where(gte(botReflectionsTable.createdAt, periodStart));

  const [practiceAgg] = await db
    .select({
      n: sql<number>`COUNT(*)`,
      adopted: sql<number>`COUNT(*) FILTER (WHERE ${practiceRunsTable.adopted} = true)`,
      gain: sql<number>`COALESCE(AVG(${practiceRunsTable.improvement}) FILTER (WHERE ${practiceRunsTable.adopted} = true), 0)`,
    })
    .from(practiceRunsTable)
    .where(gte(practiceRunsTable.createdAt, periodStart));

  const [transferAgg] = await db
    .select({
      n: sql<number>`COUNT(*)`,
      applied: sql<number>`COUNT(*) FILTER (WHERE ${knowledgeTransfersTable.status} = 'applied')`,
    })
    .from(knowledgeTransfersTable)
    .where(gte(knowledgeTransfersTable.createdAt, periodStart));

  const [modAgg] = await db
    .select({
      proposed: sql<number>`COUNT(*) FILTER (WHERE ${selfModificationsTable.createdAt} >= ${periodStart.toISOString()})`,
      promoted: sql<number>`COUNT(*) FILTER (WHERE ${selfModificationsTable.status} = 'promoted')`,
      rolledBack: sql<number>`COUNT(*) FILTER (WHERE ${selfModificationsTable.status} = 'rolled_back')`,
      rejected: sql<number>`COUNT(*) FILTER (WHERE ${selfModificationsTable.status} = 'rejected')`,
    })
    .from(selfModificationsTable);

  // Blocked promotions = practice runs that failed fidelity (degrading gains blocked).
  const [blockedAgg] = await db
    .select({ n: sql<number>`COUNT(*) FILTER (WHERE ${practiceRunsTable.passedFidelity} = false)` })
    .from(practiceRunsTable)
    .where(gte(practiceRunsTable.createdAt, periodStart));

  const killSwitchActive = await isKillSwitchActive();

  const [row] = await db
    .insert(selfActualizationMetricsTable)
    .values({
      periodStart,
      periodEnd,
      scope: "platform",
      avgCompetence: Number(capAgg?.avgCompetence ?? 0),
      avgConfidence: Number(capAgg?.avgConfidence ?? 0),
      avgTrend: Number(capAgg?.avgTrend ?? 0),
      reflections: Number(reflAgg?.n ?? 0),
      practiceRuns: Number(practiceAgg?.n ?? 0),
      practiceAdopted: Number(practiceAgg?.adopted ?? 0),
      practiceGainAvg: Number(practiceAgg?.gain ?? 0),
      transfers: Number(transferAgg?.n ?? 0),
      transfersApplied: Number(transferAgg?.applied ?? 0),
      modsProposed: Number(modAgg?.proposed ?? 0),
      modsPromoted: Number(modAgg?.promoted ?? 0),
      modsRolledBack: Number(modAgg?.rolledBack ?? 0),
      blockedPromotions: Number(blockedAgg?.n ?? 0),
      killSwitchActive,
      metadata: { rejectedMods: Number(modAgg?.rejected ?? 0) },
    })
    .returning();

  return row;
}

/** Latest telemetry snapshots for the console. */
export async function listSelfActualizationMetrics(limit = 30) {
  return db
    .select()
    .from(selfActualizationMetricsTable)
    .orderBy(desc(selfActualizationMetricsTable.createdAt))
    .limit(limit);
}

/** Aggregate fleet snapshot computed live (no persistence) for the overview. */
export async function getLiveSnapshot(): Promise<SelfActualizationSnapshot> {
  const [capAgg] = await db
    .select({
      avgCompetence: sql<number>`COALESCE(AVG(${botCapabilityModelTable.competence}), 0)`,
      avgConfidence: sql<number>`COALESCE(AVG(${botCapabilityModelTable.confidence}), 0)`,
      avgTrend: sql<number>`COALESCE(AVG(${botCapabilityModelTable.trend}), 0)`,
    })
    .from(botCapabilityModelTable);
  const [modProposed] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(selfModificationsTable);
  const [modPromoted] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(selfModificationsTable)
    .where(eq(selfModificationsTable.status, "promoted"));
  const [modRolled] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(selfModificationsTable)
    .where(eq(selfModificationsTable.status, "rolled_back"));

  return {
    avgCompetence: Number(capAgg?.avgCompetence ?? 0),
    avgConfidence: Number(capAgg?.avgConfidence ?? 0),
    avgTrend: Number(capAgg?.avgTrend ?? 0),
    reflections: 0,
    practiceRuns: 0,
    practiceAdopted: 0,
    practiceGainAvg: 0,
    transfers: 0,
    transfersApplied: 0,
    modsProposed: Number(modProposed?.n ?? 0),
    modsPromoted: Number(modPromoted?.n ?? 0),
    modsRolledBack: Number(modRolled?.n ?? 0),
    blockedPromotions: 0,
    killSwitchActive: await isKillSwitchActive(),
  };
}
