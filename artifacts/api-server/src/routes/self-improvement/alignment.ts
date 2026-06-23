import { Router, type IRouter } from "express";
import { db, alignmentSignalsTable } from "@workspace/db";
import { eq, desc, gte, and, isNotNull, count } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/self-improvement/alignment/signals", async (req, res): Promise<void> => {
  const stakeholder = req.query.stakeholder as string | undefined;
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const conditions: ReturnType<typeof eq>[] = [gte(alignmentSignalsTable.createdAt, since) as ReturnType<typeof eq>];
  if (stakeholder) {
    conditions.push(eq(alignmentSignalsTable.sourceStakeholder, stakeholder as "owner" | "client" | "downstream"));
  }

  const signals = await db
    .select()
    .from(alignmentSignalsTable)
    .where(and(...conditions))
    .orderBy(desc(alignmentSignalsTable.createdAt))
    .limit(100);

  res.json(signals);
});

router.get("/self-improvement/alignment/rules", async (req, res): Promise<void> => {
  const status = (req.query.status as string) ?? "proposed";

  const rules = await db
    .select()
    .from(alignmentSignalsTable)
    .where(
      and(
        isNotNull(alignmentSignalsTable.extractedSoftRule),
        eq(alignmentSignalsTable.softRuleStatus, status),
      ),
    )
    .orderBy(desc(alignmentSignalsTable.softRuleConfidence))
    .limit(100);

  const deduplicated = Object.values(
    Object.fromEntries(rules.map((r) => [r.clusterId ?? r.id, r])),
  );

  res.json(deduplicated);
});

router.get("/self-improvement/alignment/summary", async (req, res): Promise<void> => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const signals = await db
    .select()
    .from(alignmentSignalsTable)
    .where(gte(alignmentSignalsTable.createdAt, since))
    .limit(1000);

  const byStakeholder: Record<string, number> = {};
  for (const s of signals) {
    const key = s.sourceStakeholder;
    byStakeholder[key] = (byStakeholder[key] ?? 0) + 1;
  }

  const proposedRules = signals.filter((s) => s.softRuleStatus === "proposed").length;
  const activeRules = signals.filter((s) => s.softRuleStatus === "active").length;
  const disabledRules = signals.filter((s) => s.softRuleStatus === "disabled").length;

  res.json({
    totalSignals: signals.length,
    byStakeholder,
    proposedRules,
    activeRules,
    disabledRules,
  });
});

const signalSchema = z.object({
  originalProposal: z.record(z.string(), z.unknown()).optional(),
  humanEdit: z.record(z.string(), z.unknown()).optional(),
  diffSummary: z.string().optional(),
  patternCategory: z.string().optional(),
  sourceStakeholder: z.enum(["owner", "client", "downstream"]).optional(),
  clientNpsScore: z.number().optional(),
  renewalOutcome: z.string().optional(),
  approvalId: z.number().int().optional(),
});

router.post("/self-improvement/alignment/signals", async (req, res): Promise<void> => {
  const parsed = signalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [signal] = await db
    .insert(alignmentSignalsTable)
    .values({
      originalProposal: (parsed.data.originalProposal ?? {}) as Record<string, unknown>,
      humanEdit: (parsed.data.humanEdit ?? {}) as Record<string, unknown>,
      diffSummary: parsed.data.diffSummary,
      patternCategory: parsed.data.patternCategory,
      sourceStakeholder: parsed.data.sourceStakeholder ?? "owner",
      clientNpsScore: parsed.data.clientNpsScore,
      renewalOutcome: parsed.data.renewalOutcome,
      approvalId: parsed.data.approvalId,
    })
    .returning();

  res.status(201).json(signal);
});

const ruleActionSchema = z.object({ action: z.enum(["enable", "disable"]) });

router.post("/self-improvement/alignment/rules/:clusterId/action", async (req, res): Promise<void> => {
  const clusterId = req.params.clusterId;
  const parsed = ruleActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const newStatus = parsed.data.action === "enable" ? "active" : "disabled";
  await db
    .update(alignmentSignalsTable)
    .set({ softRuleStatus: newStatus })
    .where(eq(alignmentSignalsTable.clusterId, clusterId));

  res.json({ ok: true, status: newStatus });
});

export default router;
