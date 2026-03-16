import { db, llmUsageLogTable, clientCostCapsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { broadcastSSE } from "./scheduler";

export async function getMonthlySpend(clientId: number): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${llmUsageLogTable.estimatedCostUsd}::numeric), 0)`,
    })
    .from(llmUsageLogTable)
    .where(
      and(
        eq(llmUsageLogTable.clientId, clientId),
        gte(llmUsageLogTable.calledAt, monthStart),
      ),
    );

  return parseFloat(result[0]?.total ?? "0");
}

export async function getCostCap(clientId: number) {
  const [cap] = await db
    .select()
    .from(clientCostCapsTable)
    .where(eq(clientCostCapsTable.clientId, clientId));
  return cap ?? null;
}

export async function upsertCostCap(clientId: number, monthlyCapUsd: number, alertAt80Pct: boolean, pauseAutonomousOnExhaust: boolean) {
  const existing = await getCostCap(clientId);
  if (existing) {
    const [updated] = await db
      .update(clientCostCapsTable)
      .set({
        monthlyCapUsd: String(monthlyCapUsd),
        alertAt80Pct,
        pauseAutonomousOnExhaust,
        updatedAt: new Date(),
      })
      .where(eq(clientCostCapsTable.clientId, clientId))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(clientCostCapsTable)
    .values({
      clientId,
      monthlyCapUsd: String(monthlyCapUsd),
      alertAt80Pct,
      pauseAutonomousOnExhaust,
    })
    .returning();
  return created;
}

export async function checkCostCapAlerts(clientId: number): Promise<{
  withinBudget: boolean;
  spend: number;
  cap: number;
  pctUsed: number;
  alert80: boolean;
  alert100: boolean;
  pauseAutonomous: boolean;
}> {
  const cap = await getCostCap(clientId);
  const spend = await getMonthlySpend(clientId);

  if (!cap || parseFloat(cap.monthlyCapUsd) <= 0) {
    return { withinBudget: true, spend, cap: 0, pctUsed: 0, alert80: false, alert100: false, pauseAutonomous: false };
  }

  const capUsd = parseFloat(cap.monthlyCapUsd);
  const pctUsed = (spend / capUsd) * 100;
  const currentMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;

  let alert80 = false;
  let alert100 = false;
  const needsReset = cap.alertResetMonth !== currentMonth;

  if (needsReset) {
    await db
      .update(clientCostCapsTable)
      .set({ alerted80Pct: false, alerted100Pct: false, alertResetMonth: currentMonth })
      .where(eq(clientCostCapsTable.clientId, clientId));
  }

  const was80 = needsReset ? false : cap.alerted80Pct;
  const was100 = needsReset ? false : cap.alerted100Pct;

  if (pctUsed >= 80 && cap.alertAt80Pct && !was80) {
    alert80 = true;
    await db
      .update(clientCostCapsTable)
      .set({ alerted80Pct: true })
      .where(eq(clientCostCapsTable.clientId, clientId));

    broadcastSSE("cost_alert", {
      clientId,
      level: "warning",
      message: `LLM spend has reached 80% of the monthly cap ($${spend.toFixed(2)} / $${capUsd.toFixed(2)})`,
      pctUsed: Math.round(pctUsed),
    });
  }

  if (pctUsed >= 100 && !was100) {
    alert100 = true;
    await db
      .update(clientCostCapsTable)
      .set({ alerted100Pct: true })
      .where(eq(clientCostCapsTable.clientId, clientId));

    broadcastSSE("cost_alert", {
      clientId,
      level: "critical",
      message: `LLM spend has reached 100% of the monthly cap ($${spend.toFixed(2)} / $${capUsd.toFixed(2)})`,
      pctUsed: Math.round(pctUsed),
    });
  }

  return {
    withinBudget: pctUsed < 100,
    spend,
    cap: capUsd,
    pctUsed: Math.round(pctUsed * 100) / 100,
    alert80,
    alert100,
    pauseAutonomous: pctUsed >= 100 && cap.pauseAutonomousOnExhaust,
  };
}

export async function shouldPauseAutonomous(clientId: number): Promise<boolean> {
  const result = await checkCostCapAlerts(clientId);
  return result.pauseAutonomous;
}
