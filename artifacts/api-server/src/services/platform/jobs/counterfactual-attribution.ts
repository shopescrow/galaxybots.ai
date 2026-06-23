import {
  db,
  toolActivityLogTable,
  syntheticControlsTable,
  causalOutcomesTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, desc } from "drizzle-orm";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MEASUREMENT_LAG_DAYS = 7;

let lastAttributionRun = 0;

async function measureClientActivity(
  clientId: number,
  fromDate: Date,
  toDate: Date,
): Promise<number> {
  const activities = await db
    .select({ count: toolActivityLogTable.id })
    .from(toolActivityLogTable)
    .where(
      and(
        eq(toolActivityLogTable.clientId, clientId),
        gte(toolActivityLogTable.createdAt, fromDate),
        lte(toolActivityLogTable.createdAt, toDate),
      ),
    );
  return activities.length;
}

async function computeAttributionForControl(
  control: typeof syntheticControlsTable.$inferSelect,
) {
  if (!control.windowStart || !control.windowEnd) return;

  const measureStart = new Date(control.windowEnd);
  const measureEnd = new Date(
    control.windowEnd.getTime() + MEASUREMENT_LAG_DAYS * 24 * 60 * 60 * 1000,
  );

  const [treatedBefore, treatedAfter] = await Promise.all([
    measureClientActivity(control.clientId, control.windowStart, control.windowEnd),
    measureClientActivity(control.clientId, measureStart, measureEnd),
  ]);

  const controlClientIds = control.controlClientIds as number[];
  if (controlClientIds.length === 0) return;

  const controlAfterCounts = await Promise.all(
    controlClientIds.map((id) => measureClientActivity(id, measureStart, measureEnd)),
  );

  const controlAfterMean =
    controlAfterCounts.reduce((s, v) => s + v, 0) / controlAfterCounts.length;

  const controlBeforeCounts = await Promise.all(
    controlClientIds.map((id) =>
      measureClientActivity(id, control.windowStart!, control.windowEnd!),
    ),
  );

  const controlBeforeMean =
    controlBeforeCounts.reduce((s, v) => s + v, 0) / controlBeforeCounts.length;

  const treatedDelta = treatedAfter - treatedBefore;
  const controlDelta = controlAfterMean - controlBeforeMean;
  const treatmentEffect = treatedDelta - controlDelta;

  const matchQuality = control.matchScore ?? 0;
  const cohortSize = controlClientIds.length;
  const attributionConfidence = Math.min(
    0.99,
    matchQuality * 0.5 + Math.min(cohortSize / 10, 0.3) + (treatmentEffect !== 0 ? 0.2 : 0),
  );

  const causalSummary = `${control.actionHash.slice(0, 8)}: treated delta=${treatedDelta > 0 ? "+" : ""}${treatedDelta}, control delta=${controlDelta > 0 ? "+" : ""}${controlDelta.toFixed(1)}, treatment effect=${treatmentEffect > 0 ? "+" : ""}${treatmentEffect.toFixed(1)}`;

  await db.insert(causalOutcomesTable).values({
    toolName: "tool_activity",
    metricName: "activity_count",
    metricDelta: treatedDelta,
    counterfactualBaseline: controlDelta,
    counterfactualMatchQuality: matchQuality,
    attributionConfidence,
    measurementLagDays: MEASUREMENT_LAG_DAYS,
    clientId: control.clientId,
    treatedCohortSize: 1,
    controlCohortSize: cohortSize,
    treatmentEffect,
    observedOutcome: treatedAfter,
    causalPatternSummary: causalSummary,
    measuredAt: new Date(),
  });

  console.log(
    `[counterfactual] Attribution for client ${control.clientId}: effect=${treatmentEffect.toFixed(2)}, confidence=${attributionConfidence.toFixed(2)}`,
  );
}

export async function runCounterfactualAttribution() {
  const now = Date.now();
  if (now - lastAttributionRun < ONE_WEEK_MS) return;
  lastAttributionRun = now;

  console.log("[counterfactual] Running weekly attribution job...");

  const controls = await db
    .select()
    .from(syntheticControlsTable)
    .where(
      gte(
        syntheticControlsTable.windowEnd,
        new Date(now - 30 * 24 * 60 * 60 * 1000),
      ),
    )
    .orderBy(desc(syntheticControlsTable.computedAt))
    .limit(100);

  for (const control of controls) {
    try {
      await computeAttributionForControl(control);
    } catch (err) {
      console.error(`[counterfactual] Error for control #${control.id}:`, err);
    }
  }

  console.log("[counterfactual] Weekly attribution complete.");
}
