import {
  db,
  abExperimentsTable,
  abExperimentResultsTable,
  weightSnapshotsTable,
  coordinatorWeightsTable,
  conductorStrategiesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

function consistentHash(sessionId: string): number {
  const hash = crypto.createHash("md5").update(sessionId).digest("hex");
  return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}

export async function createSplitPolicy(
  clientId: number,
  splitPct: number,
  controlWeightSnapshotId: number | null,
  treatmentDescription: string,
): Promise<number> {
  if (controlWeightSnapshotId != null) {
    const [snap] = await db
      .select({ clientId: weightSnapshotsTable.clientId })
      .from(weightSnapshotsTable)
      .where(eq(weightSnapshotsTable.id, controlWeightSnapshotId));
    if (!snap || snap.clientId !== clientId) {
      throw new Error(
        `[ABExperiment] Snapshot ${controlWeightSnapshotId} is not owned by client ${clientId} — experiment creation rejected`,
      );
    }
  }

  const [experiment] = await db
    .insert(abExperimentsTable)
    .values({
      clientId,
      splitPct: Math.min(100, Math.max(0, splitPct)),
      controlSnapshotId: controlWeightSnapshotId,
      treatmentDescription,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: abExperimentsTable.id });

  console.log(
    `[ABExperiment] Created experiment ${experiment.id} for client ${clientId}: ${splitPct}% treatment, control snapshot=${controlWeightSnapshotId}`,
  );

  return experiment.id;
}

export async function resolveSplit(
  clientId: number,
  sessionId: string,
): Promise<"control" | "treatment"> {
  try {
    const [experiment] = await db
      .select()
      .from(abExperimentsTable)
      .where(
        and(
          eq(abExperimentsTable.clientId, clientId),
          eq(abExperimentsTable.status, "running"),
        ),
      )
      .limit(1);

    if (!experiment) return "treatment";

    const hash = consistentHash(sessionId);
    const variant: "control" | "treatment" = hash < experiment.splitPct / 100 ? "treatment" : "control";

    console.log(
      `[ABExperiment] Session ${sessionId} → variant=${variant} (hash=${hash.toFixed(4)}, splitPct=${experiment.splitPct})`,
    );

    return variant;
  } catch {
    return "treatment";
  }
}

export async function recordExperimentResult(
  clientId: number,
  sessionId: string,
  qualityScore: number,
  persistedVariant?: "control" | "treatment",
): Promise<void> {
  try {
    const [experiment] = await db
      .select()
      .from(abExperimentsTable)
      .where(
        and(
          eq(abExperimentsTable.clientId, clientId),
          eq(abExperimentsTable.status, "running"),
        ),
      )
      .limit(1);

    if (!experiment) return;

    const variant = persistedVariant ?? await resolveSplit(clientId, sessionId);

    await db.insert(abExperimentResultsTable).values({
      experimentId: experiment.id,
      sessionId,
      variant,
      qualityScore: Math.min(1, Math.max(0, qualityScore)),
      recordedAt: new Date(),
    });

    await checkSignificance(experiment.id);
  } catch (err) {
    console.error("[ABExperiment] recordExperimentResult failed:", err);
  }
}

export async function checkSignificance(experimentId: number): Promise<{
  significant: boolean;
  pValue: number;
  winner: "control" | "treatment" | null;
}> {
  try {
    const rows = await db
      .select({
        variant: abExperimentResultsTable.variant,
        avgScore: sql<number>`avg(${abExperimentResultsTable.qualityScore})`,
        stdDev: sql<number>`stddev(${abExperimentResultsTable.qualityScore})`,
        count: sql<number>`count(*)`,
      })
      .from(abExperimentResultsTable)
      .where(eq(abExperimentResultsTable.experimentId, experimentId))
      .groupBy(abExperimentResultsTable.variant);

    const controlRow = rows.find((r) => r.variant === "control");
    const treatmentRow = rows.find((r) => r.variant === "treatment");

    if (!controlRow || !treatmentRow) {
      return { significant: false, pValue: 1, winner: null };
    }

    const n1 = Number(controlRow.count);
    const n2 = Number(treatmentRow.count);

    if (n1 < 5 || n2 < 5) {
      return { significant: false, pValue: 1, winner: null };
    }

    const mean1 = Number(controlRow.avgScore ?? 0);
    const mean2 = Number(treatmentRow.avgScore ?? 0);
    const std1 = Number(controlRow.stdDev ?? 0.1);
    const std2 = Number(treatmentRow.stdDev ?? 0.1);

    const se = Math.sqrt((std1 * std1) / n1 + (std2 * std2) / n2);
    if (se === 0) return { significant: false, pValue: 1, winner: null };

    const tStat = Math.abs(mean2 - mean1) / se;
    const df = n1 + n2 - 2;
    const pValue = approximateTwoTailPValue(tStat, df);

    const significant = pValue < 0.05;
    const winner: "control" | "treatment" | null = significant
      ? mean2 > mean1
        ? "treatment"
        : "control"
      : null;

    if (significant && winner) {
      await db
        .update(abExperimentsTable)
        .set({
          status: "concluded",
          winnerVariant: winner,
          pValue,
          concludedAt: new Date(),
        })
        .where(eq(abExperimentsTable.id, experimentId));

      console.log(
        `[ABExperiment] Experiment ${experimentId} concluded — winner=${winner}, p=${pValue.toFixed(4)}, control_mean=${mean1.toFixed(3)}, treatment_mean=${mean2.toFixed(3)}`,
      );

      if (winner === "treatment") {
        await promoteWinnerWeights(experimentId);
      } else if (winner === "control") {
        await restoreControlSnapshot(experimentId);
      }
    }

    return { significant, pValue, winner };
  } catch (err) {
    console.error("[ABExperiment] checkSignificance failed:", err);
    return { significant: false, pValue: 1, winner: null };
  }
}

async function restoreControlSnapshot(experimentId: number): Promise<void> {
  try {
    const [experiment] = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.id, experimentId));

    if (!experiment || !experiment.clientId) return;
    const { clientId } = experiment;

    if (!experiment.controlSnapshotId) {
      console.log(`[ABExperiment] Control wins for experiment ${experimentId} but no control snapshot to restore`);
      await db
        .update(abExperimentsTable)
        .set({ status: "promoted" })
        .where(eq(abExperimentsTable.id, experimentId));
      return;
    }

    const [snapshot] = await db
      .select({ data: weightSnapshotsTable.data })
      .from(weightSnapshotsTable)
      .where(eq(weightSnapshotsTable.id, experiment.controlSnapshotId));

    if (!snapshot?.data) {
      console.warn(`[ABExperiment] Control snapshot ${experiment.controlSnapshotId} has no data`);
      return;
    }

    const snapshotData = snapshot.data as {
      coordinator?: Array<{
        id: number;
        botId: number;
        taskCategory: string;
        role: string;
        weight: string | number;
        sampleCount: number;
        modelVersion?: string | null;
      }>;
      conductorPriors?: Array<{
        taskCategory: string;
        strategy: string;
        avgScore: number;
        runCount: number;
      }>;
      capturedAt?: string;
    };

    const coordinatorRows = snapshotData.coordinator ?? [];

    for (const w of coordinatorRows) {
      await db
        .update(coordinatorWeightsTable)
        .set({
          weight: String(w.weight),
          sampleCount: w.sampleCount ?? 0,
          modelVersion: w.modelVersion ?? null,
          lastUpdated: new Date(),
        })
        .where(
          and(
            eq(coordinatorWeightsTable.clientId, clientId),
            eq(coordinatorWeightsTable.botId, w.botId),
            eq(coordinatorWeightsTable.taskCategory, w.taskCategory),
            eq(coordinatorWeightsTable.role, w.role),
          ),
        )
        .catch(() => {});
    }

    if (snapshotData.capturedAt && clientId) {
      const capturedAt = new Date(snapshotData.capturedAt);
      await db
        .delete(conductorStrategiesTable)
        .where(
          and(
            eq(conductorStrategiesTable.clientId, clientId),
            sql`${conductorStrategiesTable.createdAt} > ${capturedAt}`,
          ),
        )
        .catch(() => {});
    }

    await db
      .update(abExperimentsTable)
      .set({ status: "promoted" })
      .where(eq(abExperimentsTable.id, experimentId));

    console.log(
      `[ABExperiment] Restored control snapshot ${experiment.controlSnapshotId} for client ${clientId} (experiment ${experimentId}): ${coordinatorRows.length} coordinator rows restored`,
    );
  } catch (err) {
    console.error("[ABExperiment] restoreControlSnapshot failed:", err);
  }
}

async function promoteWinnerWeights(experimentId: number): Promise<void> {
  try {
    const [experiment] = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.id, experimentId));

    if (!experiment || !experiment.clientId) return;
    const { clientId } = experiment;

    const treatmentResults = await db
      .select({
        sessionId: abExperimentResultsTable.sessionId,
        qualityScore: abExperimentResultsTable.qualityScore,
      })
      .from(abExperimentResultsTable)
      .where(
        and(
          eq(abExperimentResultsTable.experimentId, experimentId),
          eq(abExperimentResultsTable.variant, "treatment"),
        ),
      );

    if (treatmentResults.length === 0) return;

    const treatmentSessionIds = treatmentResults.map((r) => r.sessionId);

    const treatmentStrategyRows = await db
      .select({
        taskCategory: coordinatorWeightsTable.taskCategory,
        role: coordinatorWeightsTable.role,
        botId: coordinatorWeightsTable.botId,
        weight: coordinatorWeightsTable.weight,
        sampleCount: coordinatorWeightsTable.sampleCount,
        modelVersion: coordinatorWeightsTable.modelVersion,
      })
      .from(coordinatorWeightsTable)
      .where(eq(coordinatorWeightsTable.clientId, clientId));

    for (const row of treatmentStrategyRows) {
      await db
        .insert(coordinatorWeightsTable)
        .values({
          botId: row.botId,
          clientId,
          taskCategory: row.taskCategory,
          role: row.role,
          weight: row.weight,
          sampleCount: row.sampleCount ?? 0,
          modelVersion: row.modelVersion,
          lastUpdated: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            coordinatorWeightsTable.clientId,
            coordinatorWeightsTable.botId,
            coordinatorWeightsTable.taskCategory,
            coordinatorWeightsTable.role,
          ],
          set: {
            weight: row.weight,
            sampleCount: row.sampleCount ?? 0,
            modelVersion: row.modelVersion,
            lastUpdated: new Date(),
          },
        })
        .catch(() => {});
    }

    if (experiment.controlSnapshotId) {
      await db
        .insert(weightSnapshotsTable)
        .values({
          clientId,
          snapshotType: "rollback",
          data: {
            reason: "ab_experiment_superseded",
            experimentId,
            treatmentSessionCount: treatmentSessionIds.length,
            promotedAt: new Date().toISOString(),
          } as unknown as Record<string, unknown>,
          avgQualityAtTime: null,
          createdAt: new Date(),
        })
        .catch(() => {});
    }

    await db
      .update(abExperimentsTable)
      .set({ status: "promoted" })
      .where(eq(abExperimentsTable.id, experimentId));

    console.log(
      `[ABExperiment] Promoted treatment weights for client ${clientId} (experiment ${experimentId}): ${treatmentStrategyRows.length} weight rows confirmed live`,
    );
  } catch (err) {
    console.error("[ABExperiment] promoteWinnerWeights failed:", err);
  }
}

function approximateTwoTailPValue(tStat: number, df: number): number {
  const x = df / (df + tStat * tStat);
  const betaInc = incompleteBeta(df / 2, 0.5, x);
  return Math.min(1, Math.max(0, betaInc));
}

function incompleteBeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;

  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;

  let result = 0;
  let term = 1;
  for (let i = 0; i < 200; i++) {
    term *= (a + i) * x / (a + b + i);
    result += term / (a + i + 1);
    if (Math.abs(term) < 1e-10) break;
  }

  return front * (1 + result);
}

function lgamma(n: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = n;
  let x = n;
  const tmp = x + 5.5;
  const ser = c.reduce((acc, ci) => acc + ci / ++y, 1.000000000190015);
  return (x + 0.5) * Math.log(tmp) - tmp + Math.log((2.5066282746310005 * ser) / x);
}

export async function getExperimentResults(experimentId: number): Promise<{
  experiment: typeof abExperimentsTable.$inferSelect | null;
  variants: Array<{
    variant: string;
    count: number;
    avgScore: number;
    stdDev: number;
  }>;
  significance: {
    significant: boolean;
    pValue: number;
    winner: "control" | "treatment" | null;
  };
}> {
  const [experiment] = await db
    .select()
    .from(abExperimentsTable)
    .where(eq(abExperimentsTable.id, experimentId));

  if (!experiment) {
    return {
      experiment: null,
      variants: [],
      significance: { significant: false, pValue: 1, winner: null },
    };
  }

  const rows = await db
    .select({
      variant: abExperimentResultsTable.variant,
      avgScore: sql<number>`avg(${abExperimentResultsTable.qualityScore})`,
      stdDev: sql<number>`stddev(${abExperimentResultsTable.qualityScore})`,
      count: sql<number>`count(*)`,
    })
    .from(abExperimentResultsTable)
    .where(eq(abExperimentResultsTable.experimentId, experimentId))
    .groupBy(abExperimentResultsTable.variant);

  const variants = rows.map((r) => ({
    variant: r.variant,
    count: Number(r.count),
    avgScore: Number(r.avgScore ?? 0),
    stdDev: Number(r.stdDev ?? 0),
  }));

  const significance = await checkSignificance(experimentId);

  return { experiment, variants, significance };
}
