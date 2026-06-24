import {
  db,
  coordinatorWeightsTable,
  clientBotsTable,
  botsTable,
  personaDivergenceLogTable,
  personaDivergenceAlertTable,
} from "@workspace/db";
import { eq, and, inArray, isNull } from "drizzle-orm";

const SIMILARITY_THRESHOLD_LOW = 0.60;
const SIMILARITY_THRESHOLD_MEDIUM = 0.40;

const COORDINATOR_ROLES = ["thinker", "worker", "verifier"] as const;
const TASK_CATEGORIES = ["research", "analysis", "execution", "review", "legal", "financial"] as const;

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return sum;
}

function magnitude(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 1.0;
  return dotProduct(a, b) / (magA * magB);
}

function buildWeightVector(
  weights: Map<string, number>,
): number[] {
  const vector: number[] = [];
  for (const category of TASK_CATEGORIES) {
    for (const role of COORDINATOR_ROLES) {
      vector.push(weights.get(`${category}:${role}`) ?? 1.0);
    }
  }
  return vector;
}

function findMostDivergentCategory(
  aWeights: Map<string, number>,
  bWeights: Map<string, number>,
): string | null {
  let maxDiff = 0;
  let mostDivergent: string | null = null;

  for (const category of TASK_CATEGORIES) {
    let sumA = 0;
    let sumB = 0;
    for (const role of COORDINATOR_ROLES) {
      sumA += aWeights.get(`${category}:${role}`) ?? 1.0;
      sumB += bWeights.get(`${category}:${role}`) ?? 1.0;
    }
    const diff = Math.abs(sumA - sumB);
    if (diff > maxDiff) {
      maxDiff = diff;
      mostDivergent = category;
    }
  }

  return mostDivergent;
}

export async function runPersonaDivergenceMonitor(): Promise<{
  botsChecked: number;
  pairsAnalyzed: number;
  alertsCreated: number;
}> {
  console.log("[PersonaDivergenceMonitor] Starting daily divergence run...");

  const allClientBotRows = await db
    .select({
      botId: clientBotsTable.botId,
      clientId: clientBotsTable.clientId,
    })
    .from(clientBotsTable)
    .where(eq(clientBotsTable.status, "active"));

  const botClientMap = new Map<number, number[]>();
  for (const row of allClientBotRows) {
    const clients = botClientMap.get(row.botId) ?? [];
    clients.push(row.clientId);
    botClientMap.set(row.botId, clients);
  }

  const botsWithMultipleClients = [...botClientMap.entries()].filter(
    ([, clients]) => clients.length >= 2,
  );

  if (botsWithMultipleClients.length === 0) {
    console.log("[PersonaDivergenceMonitor] No bots with multiple clients — nothing to check.");
    return { botsChecked: 0, pairsAnalyzed: 0, alertsCreated: 0 };
  }

  const allBotIds = botsWithMultipleClients.map(([botId]) => botId);
  const botNameRows = await db
    .select({ id: botsTable.id, name: botsTable.name })
    .from(botsTable)
    .where(inArray(botsTable.id, allBotIds));

  const botNames = new Map<number, string>(botNameRows.map((r) => [r.id, r.name]));

  const weightRows = await db
    .select({
      botId: coordinatorWeightsTable.botId,
      taskCategory: coordinatorWeightsTable.taskCategory,
      role: coordinatorWeightsTable.role,
      weight: coordinatorWeightsTable.weight,
    })
    .from(coordinatorWeightsTable)
    .where(inArray(coordinatorWeightsTable.botId, allBotIds));

  const globalWeightMap = new Map<number, Map<string, number>>();
  for (const row of weightRows) {
    if (!globalWeightMap.has(row.botId)) {
      globalWeightMap.set(row.botId, new Map());
    }
    globalWeightMap.get(row.botId)!.set(`${row.taskCategory}:${row.role}`, parseFloat(row.weight));
  }

  let pairsAnalyzed = 0;
  let alertsCreated = 0;
  const now = new Date();

  for (const [botId, clientIds] of botsWithMultipleClients) {
    const botWeights = globalWeightMap.get(botId) ?? new Map<string, number>();
    const botName = botNames.get(botId) ?? `bot-${botId}`;

    for (let i = 0; i < clientIds.length; i++) {
      for (let j = i + 1; j < clientIds.length; j++) {
        const clientAId = clientIds[i];
        const clientBId = clientIds[j];

        const vectorA = buildWeightVector(botWeights);
        const vectorB = buildWeightVector(botWeights);

        const similarity = cosineSimilarity(vectorA, vectorB);
        const mostDivergentCategory = findMostDivergentCategory(botWeights, botWeights);

        pairsAnalyzed++;

        try {
          await db.insert(personaDivergenceLogTable).values({
            botId,
            clientAId,
            clientBId,
            cosineSimilarity: similarity,
            mostDivergentCategory,
            computedAt: now,
          });
        } catch (err) {
          console.error("[PersonaDivergenceMonitor] Failed to insert log:", err);
        }

        if (similarity < SIMILARITY_THRESHOLD_LOW) {
          const severity = similarity < SIMILARITY_THRESHOLD_MEDIUM ? "medium" : "low";
          const pctDiff = Math.round((1 - similarity) * 100);
          const summary = `${botName} is behaving ${pctDiff}% differently for Client ${clientAId} vs. Client ${clientBId}${mostDivergentCategory ? ` in the '${mostDivergentCategory}' category` : ""}.`;

          try {
            await db.insert(personaDivergenceAlertTable).values({
              botId,
              botName,
              clientAId,
              clientBId,
              cosineSimilarity: similarity,
              mostDivergentCategory,
              severity,
              summary,
              resolvedAt: null,
            });
            alertsCreated++;
            console.log(`[PersonaDivergenceMonitor] Alert (${severity}): ${summary}`);
          } catch (err) {
            console.error("[PersonaDivergenceMonitor] Failed to insert alert:", err);
          }
        }
      }
    }
  }

  console.log(
    `[PersonaDivergenceMonitor] Done. bots=${botsWithMultipleClients.length} pairs=${pairsAnalyzed} alerts=${alertsCreated}`,
  );

  return { botsChecked: botsWithMultipleClients.length, pairsAnalyzed, alertsCreated };
}

export async function getOpenDivergenceAlerts(
  clientId?: number,
): Promise<typeof personaDivergenceAlertTable.$inferSelect[]> {
  if (clientId !== undefined) {
    return db
      .select()
      .from(personaDivergenceAlertTable)
      .where(
        and(
          eq(personaDivergenceAlertTable.clientAId, clientId),
          isNull(personaDivergenceAlertTable.resolvedAt),
        ),
      );
  }
  return db
    .select()
    .from(personaDivergenceAlertTable)
    .where(isNull(personaDivergenceAlertTable.resolvedAt));
}

export async function resolveDivergenceAlert(alertId: number): Promise<void> {
  await db
    .update(personaDivergenceAlertTable)
    .set({ resolvedAt: new Date() })
    .where(eq(personaDivergenceAlertTable.id, alertId));
}
