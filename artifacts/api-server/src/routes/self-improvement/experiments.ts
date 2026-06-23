import { Router, type IRouter } from "express";
import { db, experimentsTable, botsTable, toolActivityLogTable, sessionOutcomesTable } from "@workspace/db";
import { eq, desc, and, gte, count } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/self-improvement/experiments", async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;

  const experiments = await db
    .select({
      id: experimentsTable.id,
      hypothesis: experimentsTable.hypothesis,
      metric: experimentsTable.metric,
      assignmentRule: experimentsTable.assignmentRule,
      splitPct: experimentsTable.splitPct,
      targetSampleSize: experimentsTable.targetSampleSize,
      currentSampleSizeA: experimentsTable.currentSampleSizeA,
      currentSampleSizeB: experimentsTable.currentSampleSizeB,
      metricValueA: experimentsTable.metricValueA,
      metricValueB: experimentsTable.metricValueB,
      tStatistic: experimentsTable.tStatistic,
      pValue: experimentsTable.pValue,
      significanceThreshold: experimentsTable.significanceThreshold,
      significanceReached: experimentsTable.significanceReached,
      winner: experimentsTable.winner,
      result: experimentsTable.result,
      startedAt: experimentsTable.startedAt,
      endedAt: experimentsTable.endedAt,
      status: experimentsTable.status,
      ethicsCheckPassed: experimentsTable.ethicsCheckPassed,
      proposedByBotId: experimentsTable.proposedByBotId,
      proposedByBotName: botsTable.name,
      createdAt: experimentsTable.createdAt,
    })
    .from(experimentsTable)
    .leftJoin(botsTable, eq(experimentsTable.proposedByBotId, botsTable.id))
    .where(status ? eq(experimentsTable.status, status) : undefined)
    .orderBy(desc(experimentsTable.startedAt))
    .limit(50);

  res.json(experiments);
});

const hypothesisSchema = z.object({
  hypothesis: z.string().min(10),
  metric: z.string().min(1),
  variantA: z.record(z.string(), z.unknown()).optional(),
  variantB: z.record(z.string(), z.unknown()).optional(),
  targetSampleSize: z.number().int().min(20).max(10000).optional(),
  proposedByBotId: z.number().int().optional(),
});

// Metrics that can be measured from existing tables
const MEASURABLE_METRICS = [
  "outcome_score",
  "session_success_rate",
  "tool_success_rate",
  "nps",
  "session_duration",
  "cost_cents",
  "loop_iterations",
  "failure_rate",
  "tool_call_count",
];

// Client-disadvantaging patterns that fail ethics check
const HARMFUL_PATTERNS = [
  /manipulat/i,
  /deceiv/i,
  /mislead/i,
  /exploit/i,
  /dark.?pattern/i,
  /fake/i,
  /trick/i,
];

async function validateExperiment(hypothesis: string, metric: string): Promise<{
  testable: boolean;
  ethicsOk: boolean;
  hasBaseRate: boolean;
  reason: string | null;
}> {
  // 1. Testability: metric must be measurable
  const metricNorm = metric.toLowerCase().replace(/[^a-z_]/g, "_");
  const isTestable = MEASURABLE_METRICS.some((m) => metricNorm.includes(m.split("_")[0]));
  if (!isTestable) {
    return {
      testable: false,
      ethicsOk: true,
      hasBaseRate: false,
      reason: `Metric "${metric}" is not measurable from platform data. Use one of: ${MEASURABLE_METRICS.join(", ")}`,
    };
  }

  // 2. Ethics check: hypothesis must not describe client-harmful patterns
  const isHarmful = HARMFUL_PATTERNS.some((re) => re.test(hypothesis));
  if (isHarmful) {
    return {
      testable: true,
      ethicsOk: false,
      hasBaseRate: false,
      reason: "Hypothesis was rejected by ethics gate: describes potentially client-harmful patterns.",
    };
  }

  // 3. Base rate check: require at least 20 existing session_outcomes or tool_activity records
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const [activityCount] = await db
      .select({ n: count(toolActivityLogTable.id) })
      .from(toolActivityLogTable)
      .where(gte(toolActivityLogTable.createdAt, since));

    const [sessionCount] = await db
      .select({ n: count(sessionOutcomesTable.id) })
      .from(sessionOutcomesTable)
      .where(gte(sessionOutcomesTable.createdAt, since));

    const total = (activityCount?.n ?? 0) + (sessionCount?.n ?? 0);
    if (total < 20) {
      return {
        testable: true,
        ethicsOk: true,
        hasBaseRate: false,
        reason: `Insufficient base rate: only ${total} events in the last 30 days (minimum 20 required). Run more sessions before A/B testing.`,
      };
    }
  } catch {
    // If the check fails, allow but note it
  }

  return { testable: true, ethicsOk: true, hasBaseRate: true, reason: null };
}

router.post("/self-improvement/experiments", async (req, res): Promise<void> => {
  const parsed = hypothesisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { hypothesis, metric, variantA, variantB, targetSampleSize, proposedByBotId } = parsed.data;

  const validation = await validateExperiment(hypothesis, metric);

  if (!validation.ethicsOk) {
    res.status(422).json({
      error: "Ethics check failed",
      details: validation.reason,
    });
    return;
  }

  if (!validation.testable) {
    res.status(422).json({
      error: "Testability check failed",
      details: validation.reason,
    });
    return;
  }

  const status = validation.hasBaseRate ? "running" : "pending_review";

  const [experiment] = await db
    .insert(experimentsTable)
    .values({
      hypothesis,
      metric,
      variantA: (variantA ?? { label: "control" }) as Record<string, unknown>,
      variantB: (variantB ?? { label: "treatment" }) as Record<string, unknown>,
      targetSampleSize: targetSampleSize ?? 100,
      proposedByBotId,
      ethicsCheckPassed: validation.ethicsOk,
      status,
    })
    .returning();

  res.status(201).json({
    ...experiment,
    validationNotes: validation.hasBaseRate
      ? null
      : validation.reason,
  });
});

router.get("/self-improvement/experiments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [experiment] = await db
    .select()
    .from(experimentsTable)
    .where(eq(experimentsTable.id, id))
    .limit(1);

  if (!experiment) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(experiment);
});

router.post("/self-improvement/experiments/:id/stop", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db
    .update(experimentsTable)
    .set({ status: "stopped", endedAt: new Date(), result: "Manually stopped" })
    .where(and(eq(experimentsTable.id, id), eq(experimentsTable.status, "running")));

  res.json({ ok: true });
});

export default router;
