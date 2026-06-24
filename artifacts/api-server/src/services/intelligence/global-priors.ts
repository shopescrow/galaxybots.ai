import {
  db,
  coordinatorWeightsTable,
  coordinatorGlobalPriorsTable,
} from "@workspace/db";
import { eq, sql, and, isNull } from "drizzle-orm";
import type { TaskCategory, CoordinatorRole } from "@workspace/db";

const TASK_CATEGORIES: TaskCategory[] = ["research", "analysis", "execution", "review", "legal", "financial"];
const COORDINATOR_ROLES: CoordinatorRole[] = ["thinker", "worker", "verifier"];

export interface GlobalPrior {
  taskCategory: string;
  role: string;
  priorWeight: number;
  totalRunCount: number;
  modelVersion: string | null;
}

export async function computeAndStoreGlobalPriors(modelVersion?: string): Promise<void> {
  try {
    const rows = await db
      .select({
        botId: coordinatorWeightsTable.botId,
        taskCategory: coordinatorWeightsTable.taskCategory,
        role: coordinatorWeightsTable.role,
        weight: coordinatorWeightsTable.weight,
        sampleCount: coordinatorWeightsTable.sampleCount,
        clientId: coordinatorWeightsTable.clientId,
        modelVersion: coordinatorWeightsTable.modelVersion,
      })
      .from(coordinatorWeightsTable)
      .where(
        modelVersion
          ? eq(coordinatorWeightsTable.modelVersion, modelVersion)
          : sql`1=1`,
      );

    // Compute per-client total run volume (sum of sampleCounts across all their rows)
    const clientTotalVolume = new Map<number | null, number>();
    for (const row of rows) {
      const key = row.clientId ?? null;
      clientTotalVolume.set(key, (clientTotalVolume.get(key) ?? 0) + (row.sampleCount ?? 0));
    }

    // Step 2: for each (clientId, taskCategory, role), compute the per-client average weight
    // across all bots. This prevents clients with many bots from having outsized influence
    // due to row count rather than run volume.
    const clientRoleAvg = new Map<string, { weightSum: number; botCount: number }>();
    for (const row of rows) {
      const compositeKey = `${row.clientId ?? "null"}::${row.taskCategory}::${row.role}`;
      const entry = clientRoleAvg.get(compositeKey) ?? { weightSum: 0, botCount: 0 };
      entry.weightSum += parseFloat(row.weight);
      entry.botCount += 1;
      clientRoleAvg.set(compositeKey, entry);
    }

    // Step 3: combine client-level averages weighted by each client's total run count.
    // Clients with more accumulated runs exert proportionally greater influence.
    const grouped = new Map<string, { weightedSum: number; totalRunCount: number }>();
    for (const [compositeKey, { weightSum, botCount }] of clientRoleAvg.entries()) {
      const [clientIdStr, taskCategory, role] = compositeKey.split("::");
      const clientId = clientIdStr === "null" ? null : parseInt(clientIdStr, 10);
      const clientAvgWeight = botCount > 0 ? weightSum / botCount : 1.0;
      const runCount = Math.max(1, clientTotalVolume.get(clientId) ?? 1);

      const priorKey = `${taskCategory}::${role}`;
      const entry = grouped.get(priorKey) ?? { weightedSum: 0, totalRunCount: 0 };
      entry.weightedSum += clientAvgWeight * runCount;
      entry.totalRunCount += runCount;
      grouped.set(priorKey, entry);
    }

    for (const [key, { weightedSum, totalRunCount }] of grouped.entries()) {
      const [taskCategory, role] = key.split("::");
      const priorWeight = totalRunCount > 0 ? weightedSum / totalRunCount : 1.0;
      const clampedWeight = String(Math.max(0.1, Math.min(10.0, priorWeight)));

      await db
        .delete(coordinatorGlobalPriorsTable)
        .where(
          and(
            eq(coordinatorGlobalPriorsTable.taskCategory, taskCategory!),
            eq(coordinatorGlobalPriorsTable.role, role!),
            modelVersion
              ? eq(coordinatorGlobalPriorsTable.modelVersion, modelVersion)
              : isNull(coordinatorGlobalPriorsTable.modelVersion),
          ),
        );

      await db
        .insert(coordinatorGlobalPriorsTable)
        .values({
          taskCategory: taskCategory!,
          role: role!,
          priorWeight: clampedWeight,
          totalRunCount: totalRunCount,
          modelVersion: modelVersion ?? null,
          updatedAt: new Date(),
        });
    }

    console.log(`[GlobalPriors] Computed priors for ${grouped.size} (category, role) pairs`);
  } catch (err) {
    console.error("[GlobalPriors] Failed to compute global priors:", err);
  }
}

export async function getGlobalPriors(modelVersion?: string): Promise<Map<string, number>> {
  try {
    const rows = await db
      .select()
      .from(coordinatorGlobalPriorsTable)
      .where(
        modelVersion
          ? eq(coordinatorGlobalPriorsTable.modelVersion, modelVersion)
          : sql`1=1`,
      );

    const priorMap = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.taskCategory}::${row.role}`;
      priorMap.set(key, parseFloat(row.priorWeight));
    }

    return priorMap;
  } catch {
    return new Map();
  }
}

export async function initializeClientWeightsFromPriors(
  clientId: number,
  botIds: number[],
  clientRunCount: number,
  modelVersion?: string,
): Promise<void> {
  if (botIds.length === 0) return;

  const priorMap = await getGlobalPriors(modelVersion);
  if (priorMap.size === 0) {
    console.log(`[GlobalPriors] No global priors available — using uniform weights for client ${clientId}`);
    return;
  }

  const priorBlendWeight = 1 / (clientRunCount + 1);

  for (const botId of botIds) {
    for (const taskCategory of TASK_CATEGORIES) {
      for (const role of COORDINATOR_ROLES) {
        const key = `${taskCategory}::${role}`;
        const globalPrior = priorMap.get(key) ?? 1.0;
        const blendedWeight = globalPrior * priorBlendWeight + 1.0 * (1 - priorBlendWeight);

        await db
          .insert(coordinatorWeightsTable)
          .values({
            botId,
            clientId,
            taskCategory,
            role,
            weight: String(Math.max(0.1, Math.min(10.0, blendedWeight))),
            sampleCount: 0,
            modelVersion: modelVersion ?? null,
            lastUpdated: new Date(),
          })
          .onConflictDoNothing();
      }
    }
  }

  console.log(
    `[GlobalPriors] Initialized weights for client ${clientId}, bots=${botIds.length}, priorBlend=${priorBlendWeight.toFixed(3)}`,
  );
}

export async function blendWithGlobalPrior(
  currentWeight: number,
  taskCategory: string,
  role: string,
  clientRunCount: number,
  modelVersion?: string,
): Promise<number> {
  if (clientRunCount <= 0) return currentWeight;

  const priorMap = await getGlobalPriors(modelVersion);
  const key = `${taskCategory}::${role}`;
  const globalPrior = priorMap.get(key);
  if (!globalPrior) return currentWeight;

  const priorInfluence = 1 / (clientRunCount + 1);
  return currentWeight * (1 - priorInfluence) + globalPrior * priorInfluence;
}
