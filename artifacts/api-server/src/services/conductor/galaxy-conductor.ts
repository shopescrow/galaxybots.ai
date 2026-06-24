import { db, conductorStrategiesTable } from "@workspace/db";
import { eq, and, avg, sql } from "drizzle-orm";
import type { CommunicationStrategy, ConductorMeta } from "@workspace/db";
import { callWithFallback, ModelTier } from "../../services/ai-safety/model-fallback.js";

export const CONDUCTOR_TASK_CATEGORIES = [
  "research",
  "analysis",
  "execution",
  "review",
  "legal",
  "financial",
  "incident_response",
  "creative",
  "technical",
] as const;

export type ConductorTaskCategory = (typeof CONDUCTOR_TASK_CATEGORIES)[number];

const STRATEGY_DESCRIPTIONS: Record<CommunicationStrategy, string> = {
  parallel_synthesis:
    "All agents run simultaneously at different temperatures; outputs are merged into one definitive response. Best for: broad analysis, creative tasks, when diverse perspectives improve quality.",
  sequential_debate:
    "Agent A responds, Agent B critiques and refines, Agent C critiques further. Each pass improves the output. Best for: controversial topics, high-stakes decisions, when accuracy matters most.",
  hierarchical_delegation:
    "Lead agent decomposes the task into subtasks and assigns them to specialists; lead then integrates all outputs. Best for: complex multi-part tasks, execution work, technical problems with clear sub-problems.",
  round_robin_review:
    "Agents take turns building on each other's output, each adding expertise. Best for: iterative refinement, creative work, tasks where incremental improvement compounds.",
};

export interface StrategySelection {
  strategy: CommunicationStrategy;
  rationale: string;
  taskCategory: ConductorTaskCategory;
}

export interface PriorScore {
  strategy: CommunicationStrategy;
  avgScore: number;
  runCount: number;
}

export async function getCategoryPriors(taskCategory: string): Promise<PriorScore[]> {
  try {
    const rows = await db
      .select({
        strategy: conductorStrategiesTable.strategyChosen,
        avgScore: avg(conductorStrategiesTable.qualityScore),
        runCount: sql<number>`count(*)`,
      })
      .from(conductorStrategiesTable)
      .where(
        and(
          eq(conductorStrategiesTable.taskCategory, taskCategory),
          sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
        ),
      )
      .groupBy(conductorStrategiesTable.strategyChosen);

    return rows.map((r) => ({
      strategy: r.strategy as CommunicationStrategy,
      avgScore: Number(r.avgScore ?? 0),
      runCount: Number(r.runCount),
    }));
  } catch {
    return [];
  }
}

function inferTaskCategory(taskDescription: string): ConductorTaskCategory {
  const text = taskDescription.toLowerCase();
  if (text.includes("incident") || text.includes("alert") || text.includes("threat") || text.includes("breach")) return "incident_response";
  if (text.includes("legal") || text.includes("compliance") || text.includes("contract") || text.includes("gdpr")) return "legal";
  if (text.includes("financ") || text.includes("budget") || text.includes("revenue") || text.includes("cost")) return "financial";
  if (text.includes("research") || text.includes("gather") || text.includes("collect") || text.includes("find")) return "research";
  if (text.includes("analys") || text.includes("analyz") || text.includes("evaluate") || text.includes("assess")) return "analysis";
  if (text.includes("review") || text.includes("audit") || text.includes("check") || text.includes("verify")) return "review";
  if (text.includes("creat") || text.includes("write") || text.includes("draft") || text.includes("generat")) return "creative";
  if (text.includes("code") || text.includes("debug") || text.includes("implement") || text.includes("build")) return "technical";
  return "execution";
}

export async function selectStrategy(
  taskDescription: string,
  availableAgents: Array<{ name: string }>,
  taskCategoryOverride?: string,
  priorScoresOverride?: PriorScore[],
): Promise<StrategySelection> {
  const taskCategory = (taskCategoryOverride as ConductorTaskCategory | undefined) ?? inferTaskCategory(taskDescription);
  const priors = priorScoresOverride ?? await getCategoryPriors(taskCategory);

  const agentCount = availableAgents.length;

  const priorSummary =
    priors.length === 0
      ? "No prior runs for this task category — no performance history available yet."
      : priors
          .sort((a, b) => b.avgScore - a.avgScore)
          .map((p) => `- ${p.strategy}: avg score ${(p.avgScore * 100).toFixed(1)}% over ${p.runCount} run(s)`)
          .join("\n");

  const prompt = `You are GalaxyConductor — the orchestration brain of the GalaxyBots AI platform. Your job is to select the optimal communication strategy for a multi-agent task.

## Available Communication Strategies

${Object.entries(STRATEGY_DESCRIPTIONS).map(([name, desc]) => `### ${name}\n${desc}`).join("\n\n")}

## Current Task

Description: ${taskDescription.slice(0, 600)}
Available agents: ${agentCount} agent(s) — ${availableAgents.map((a) => a.name).join(", ")}
Task category: ${taskCategory}

## Historical Performance for "${taskCategory}" Tasks

${priorSummary}

## Instructions

Select the single best strategy for this task given:
1. The task's nature and complexity
2. The number of available agents (${agentCount})
3. Historical performance data (if available — bias toward higher-scoring strategies)
4. For very short tasks or single-agent situations, prefer parallel_synthesis

Return a JSON object with exactly:
{
  "strategy": "<one of: parallel_synthesis | sequential_debate | hierarchical_delegation | round_robin_review>",
  "rationale": "<one sentence explaining why this strategy suits this specific task>"
}`;

  try {
    const result = await callWithFallback({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are GalaxyConductor. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      maxCompletionTokens: 200,
      preferredTier: ModelTier.LOCAL,
    });

    let raw = result.completion.choices[0]?.message?.content ?? "{}";

    raw = raw.trim();
    if (raw.startsWith("```json")) raw = raw.slice(7);
    if (raw.startsWith("```")) raw = raw.slice(3);
    if (raw.endsWith("```")) raw = raw.slice(0, -3);
    raw = raw.trim();

    const parsed = JSON.parse(raw) as { strategy?: string; rationale?: string };

    const validStrategies: CommunicationStrategy[] = [
      "parallel_synthesis",
      "sequential_debate",
      "hierarchical_delegation",
      "round_robin_review",
    ];

    const strategy = validStrategies.includes(parsed.strategy as CommunicationStrategy)
      ? (parsed.strategy as CommunicationStrategy)
      : "parallel_synthesis";

    const rationale = parsed.rationale ?? `${strategy} selected for ${taskCategory} task`;

    return { strategy, rationale, taskCategory };
  } catch {
    return {
      strategy: "parallel_synthesis",
      rationale: `Defaulting to parallel synthesis for ${taskCategory} task`,
      taskCategory,
    };
  }
}

export async function recordStrategyRun(
  selection: StrategySelection,
  agentsUsed: string[],
  durationMs: number,
  costUsd?: number,
  sessionId?: string,
  contextType = "conversation",
): Promise<number> {
  try {
    const [row] = await db
      .insert(conductorStrategiesTable)
      .values({
        taskCategory: selection.taskCategory,
        strategyChosen: selection.strategy,
        rationale: selection.rationale,
        agentsUsed,
        durationMs,
        costUsd: costUsd ?? null,
        sessionId: sessionId ?? null,
        contextType,
      })
      .returning({ id: conductorStrategiesTable.id });
    return row.id;
  } catch {
    return -1;
  }
}

export async function recordStrategyOutcome(
  strategyId: number,
  qualityScore: number,
): Promise<void> {
  if (strategyId < 0) return;
  try {
    await db
      .update(conductorStrategiesTable)
      .set({ qualityScore: Math.min(1, Math.max(0, qualityScore)) })
      .where(eq(conductorStrategiesTable.id, strategyId));
  } catch (err) {
    console.error("[GalaxyConductor] recordStrategyOutcome failed:", err);
  }
}

export function buildConductorMeta(
  strategyId: number,
  selection: StrategySelection,
): ConductorMeta {
  return {
    strategyId,
    strategy: selection.strategy,
    rationale: selection.rationale,
    taskCategory: selection.taskCategory,
  };
}
