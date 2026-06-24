import { db, conductorStrategiesTable, llmUsageLogTable, coordinatorClientSettingsTable } from "@workspace/db";
import { eq, and, gte, avg, sum, sql } from "drizzle-orm";
import { writeAuditEntry } from "../audit/audit-ledger.js";
import type { CommunicationStrategy } from "@workspace/db";

export const DEFAULT_SESSION_BUDGET_USD = 2.0;
export const DEFAULT_QUALITY_FLOOR = 0.70;

const STRATEGY_RELATIVE_COST: Record<CommunicationStrategy, number> = {
  parallel_synthesis: 1.0,
  round_robin_review: 1.5,
  hierarchical_delegation: 2.0,
  sequential_debate: 3.5,
};

export interface GuardDecision {
  approved: boolean;
  strategy: CommunicationStrategy;
  originalStrategy: CommunicationStrategy;
  estimatedCostUsd: number;
  reason: string | null;
  downgraded: boolean;
}

async function getP75CostForStrategy(strategy: CommunicationStrategy, taskCategory: string): Promise<number | null> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ costUsd: conductorStrategiesTable.costUsd })
      .from(conductorStrategiesTable)
      .where(
        and(
          eq(conductorStrategiesTable.strategyChosen, strategy),
          eq(conductorStrategiesTable.taskCategory, taskCategory),
          gte(conductorStrategiesTable.createdAt, thirtyDaysAgo),
          sql`${conductorStrategiesTable.costUsd} IS NOT NULL`,
        ),
      )
      .limit(200);

    if (rows.length < 3) return null;

    const sorted = rows.map((r) => r.costUsd ?? 0).sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.75) - 1;
    return sorted[Math.max(0, idx)] ?? null;
  } catch {
    return null;
  }
}

async function getAvgQualityForStrategy(strategy: CommunicationStrategy, taskCategory: string): Promise<number> {
  try {
    const [row] = await db
      .select({ avgQ: avg(conductorStrategiesTable.qualityScore) })
      .from(conductorStrategiesTable)
      .where(
        and(
          eq(conductorStrategiesTable.strategyChosen, strategy),
          eq(conductorStrategiesTable.taskCategory, taskCategory),
          sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
        ),
      );
    return Number(row?.avgQ ?? 0.7);
  } catch {
    return 0.7;
  }
}

async function getClientMonthlySpend(clientId: number): Promise<number> {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [row] = await db
      .select({ total: sum(llmUsageLogTable.estimatedCostUsd) })
      .from(llmUsageLogTable)
      .where(
        and(
          eq(llmUsageLogTable.clientId, clientId),
          gte(llmUsageLogTable.calledAt, startOfMonth),
        ),
      );
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Returns the per-session budget limit for a client.  Priority order:
 *   1. coordinator_client_settings row with key="session_budget_usd"
 *   2. Tier-derived default from plan (starter=0.50, growth=1.00, professional=2.00, enterprise=5.00)
 *   3. DEFAULT_SESSION_BUDGET_USD constant
 */
export async function getClientSessionBudget(clientId: number): Promise<number> {
  try {
    const [row] = await db
      .select({ settingValue: coordinatorClientSettingsTable.settingValue })
      .from(coordinatorClientSettingsTable)
      .where(
        and(
          eq(coordinatorClientSettingsTable.clientId, clientId),
          eq(coordinatorClientSettingsTable.settingKey, "session_budget_usd"),
        ),
      )
      .limit(1);

    if (row?.settingValue) {
      const parsed = parseFloat(row.settingValue);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
  }

  // Tier-derived fallback
  try {
    const { db: dbConn, clientsTable } = await import("@workspace/db");
    const [client] = await dbConn
      .select({ plan: clientsTable.plan })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);

    const PLAN_SESSION_BUDGETS: Record<string, number> = {
      starter: 0.5,
      growth: 1.0,
      professional: 2.0,
      enterprise: 5.0,
      unlimited: 10.0,
    };
    const planBudget = PLAN_SESSION_BUDGETS[(client?.plan as string | undefined)?.toLowerCase() ?? ""];
    if (planBudget !== undefined) return planBudget;
  } catch {
  }

  return DEFAULT_SESSION_BUDGET_USD;
}

async function getClientPlanLimit(clientId: number): Promise<number | null> {
  try {
    const { db: dbConn, clientsTable } = await import("@workspace/db");
    const [client] = await dbConn
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);

    const planName = client?.plan as string | undefined;
    if (!planName) return null;

    const PLAN_MONTHLY_LIMITS: Record<string, number> = {
      starter: 50,
      growth: 200,
      professional: 500,
      enterprise: 2000,
      unlimited: Infinity,
    };

    return PLAN_MONTHLY_LIMITS[planName.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

async function findCheapestAcceptableStrategy(
  taskCategory: string,
  qualityFloor: number,
  excludeStrategy: CommunicationStrategy,
): Promise<{ strategy: CommunicationStrategy; estimatedCost: number } | null> {
  const ALL_STRATEGIES: CommunicationStrategy[] = [
    "parallel_synthesis",
    "round_robin_review",
    "hierarchical_delegation",
    "sequential_debate",
  ];

  const candidates = ALL_STRATEGIES.filter((s) => s !== excludeStrategy).sort(
    (a, b) => STRATEGY_RELATIVE_COST[a] - STRATEGY_RELATIVE_COST[b],
  );

  for (const candidate of candidates) {
    const quality = await getAvgQualityForStrategy(candidate, taskCategory);
    if (quality >= qualityFloor) {
      const cost = await getP75CostForStrategy(candidate, taskCategory);
      return { strategy: candidate, estimatedCost: cost ?? 0.01 };
    }
  }

  return { strategy: "parallel_synthesis", estimatedCost: 0.01 };
}

export async function guardStrategy(
  strategy: CommunicationStrategy,
  taskCategory: string,
  clientId?: number | null,
  sessionBudget?: number,
  qualityFloor: number = DEFAULT_QUALITY_FLOOR,
): Promise<GuardDecision> {
  // Resolve effective session budget: caller may provide an explicit override
  // (e.g. fetched from client settings), otherwise derive from client plan/tier.
  const effectiveSessionBudget =
    sessionBudget !== undefined
      ? sessionBudget
      : clientId != null
        ? await getClientSessionBudget(clientId)
        : DEFAULT_SESSION_BUDGET_USD;

  const estimatedCost = (await getP75CostForStrategy(strategy, taskCategory)) ?? 0;
  let reason: string | null = null;
  let finalStrategy = strategy;
  let downgraded = false;

  if (estimatedCost > 0 && estimatedCost > effectiveSessionBudget) {
    reason = `Estimated cost $${estimatedCost.toFixed(4)} exceeds session budget $${effectiveSessionBudget.toFixed(2)}`;
    downgraded = true;
  }

  if (!downgraded && clientId != null && estimatedCost > 0) {
    const [monthlySpend, planLimit] = await Promise.all([
      getClientMonthlySpend(clientId),
      getClientPlanLimit(clientId),
    ]);

    if (planLimit !== null && monthlySpend + estimatedCost > planLimit) {
      reason = `Monthly spend $${monthlySpend.toFixed(2)} + estimate $${estimatedCost.toFixed(4)} would exceed plan limit $${planLimit}`;
      downgraded = true;
    }
  }

  if (downgraded) {
    const cheaper = await findCheapestAcceptableStrategy(taskCategory, qualityFloor, strategy);
    if (cheaper) {
      finalStrategy = cheaper.strategy;
      const auditPayload = {
        originalStrategy: strategy,
        downgradedTo: finalStrategy,
        reason,
        estimatedCostUsd: estimatedCost,
        sessionBudget: effectiveSessionBudget,
        qualityFloor,
        taskCategory,
        clientId,
        appliedPolicy: {
          sessionBudgetUsd: effectiveSessionBudget,
          qualityFloor,
          source: sessionBudget !== undefined ? "caller_override" : clientId != null ? "client_tier" : "default",
        },
      };

      writeAuditEntry({
        clientId: clientId ?? null,
        engine: "budget_guard",
        decisionType: "budget_override",
        payload: auditPayload,
      }).catch(() => {});

      console.log(`[StrategyBudgetGuard] Downgraded ${strategy} → ${finalStrategy}: ${reason}`);
    } else {
      downgraded = false;
    }
  }

  return {
    approved: true,
    strategy: finalStrategy,
    originalStrategy: strategy,
    estimatedCostUsd: estimatedCost,
    reason,
    downgraded,
  };
}
