import { Router, type IRouter } from "express";
import {
  db,
  gaaGoalsTable,
  gaaJournalTable,
  gaaAuditEventsTable,
  type GaaGoal,
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "../../middleware/auth";
import {
  getConstitution,
  listEscalations,
  resolveEscalation,
  countOpenEscalations,
  listLedger,
  rollbackAction,
  getBurnState,
  recall,
  forgetClient,
  recordAuditEvent,
  detectConflicts,
  listDeadLetters,
  reviveDeadLetter,
  runGaaCycle,
} from "../../services/gaa";

const router: IRouter = Router();

// All GAA endpoints are platform-admin only.
const adminOnly = requireRole("owner");

// --- Overview --------------------------------------------------------------
router.get("/gaa/overview", adminOnly, async (_req, res): Promise<void> => {
  const goals = await db.select().from(gaaGoalsTable);
  const byStatus: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  for (const g of goals) {
    byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;
    byMode[g.mode] = (byMode[g.mode] ?? 0) + 1;
  }
  const openEscalations = await countOpenEscalations();
  const principles = await getConstitution();
  res.json({
    totalGoals: goals.length,
    byStatus,
    byMode,
    openEscalations,
    constitutionPrinciples: principles.length,
  });
});

// --- Goals -----------------------------------------------------------------
const CreateGoalBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  mode: z.enum(["autonomous", "agenda", "mission"]).default("autonomous"),
  temporalTier: z
    .enum(["evergreen", "time_boxed", "reactive"])
    .default("reactive"),
  priority: z.number().int().min(0).max(9).default(3),
  purpose: z.string().optional(),
  clientId: z.number().int().optional(),
  costEnvelopeCents: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional(),
});

router.get("/gaa/goals", adminOnly, async (req, res): Promise<void> => {
  const { status } = req.query;
  let rows: GaaGoal[];
  if (status && typeof status === "string") {
    rows = await db
      .select()
      .from(gaaGoalsTable)
      .where(eq(gaaGoalsTable.status, status))
      .orderBy(gaaGoalsTable.priority, desc(gaaGoalsTable.updatedAt));
  } else {
    rows = await db
      .select()
      .from(gaaGoalsTable)
      .orderBy(gaaGoalsTable.priority, desc(gaaGoalsTable.updatedAt));
  }
  res.json(rows);
});

router.post("/gaa/goals", adminOnly, async (req, res): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const [created] = await db
    .insert(gaaGoalsTable)
    .values({
      title: b.title,
      description: b.description ?? null,
      mode: b.mode,
      temporalTier: b.temporalTier,
      status: "pending",
      priority: b.priority,
      purpose: b.purpose ?? null,
      clientId: b.clientId ?? null,
      costEnvelopeCents: b.costEnvelopeCents ?? undefined,
      expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
      generatedBy: `user:${req.user?.userId ?? "unknown"}`,
    })
    .returning();
  await db.insert(gaaJournalTable).values({
    goalId: created.id,
    phase: "system",
    eventType: "goal_created",
    decision: "info",
    detail: `Goal created by user ${req.user?.userId ?? "unknown"}.`,
  });
  res.status(201).json(created);
});

router.get("/gaa/goals/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid goal id" });
    return;
  }
  const [goal] = await db
    .select()
    .from(gaaGoalsTable)
    .where(eq(gaaGoalsTable.id, id));
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  const journal = await db
    .select()
    .from(gaaJournalTable)
    .where(eq(gaaJournalTable.goalId, id))
    .orderBy(desc(gaaJournalTable.createdAt))
    .limit(100);
  const ledger = await listLedger(id);
  const burn = await getBurnState(id);
  res.json({ goal, journal, ledger, burn });
});

const UpdateGoalBody = z.object({
  status: z
    .enum([
      "pending",
      "active",
      "blocked",
      "suspended",
      "completed",
      "failed",
      "dead_letter",
    ])
    .optional(),
  priority: z.number().int().min(0).max(9).optional(),
  costEnvelopeCents: z.number().int().min(0).optional(),
});

router.patch("/gaa/goals/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid goal id" });
    return;
  }
  const parsed = UpdateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const [updated] = await db
    .update(gaaGoalsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(gaaGoalsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  res.json(updated);
});

// --- Journal ---------------------------------------------------------------
router.get("/gaa/journal", adminOnly, async (req, res): Promise<void> => {
  const { goalId } = req.query;
  if (goalId && typeof goalId === "string") {
    const rows = await db
      .select()
      .from(gaaJournalTable)
      .where(eq(gaaJournalTable.goalId, Number(goalId)))
      .orderBy(desc(gaaJournalTable.createdAt))
      .limit(200);
    res.json(rows);
    return;
  }
  const rows = await db
    .select()
    .from(gaaJournalTable)
    .orderBy(desc(gaaJournalTable.createdAt))
    .limit(200);
  res.json(rows);
});

// --- Audit events ----------------------------------------------------------
router.get("/gaa/audit", adminOnly, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(gaaAuditEventsTable)
    .orderBy(desc(gaaAuditEventsTable.createdAt))
    .limit(200);
  res.json(rows);
});

// --- Escalations -----------------------------------------------------------
router.get("/gaa/escalations", adminOnly, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await listEscalations(status);
  res.json(rows);
});

const ResolveEscalationBody = z.object({
  decision: z.enum(["approved", "redirected", "aborted"]),
  resolution: z.string().optional(),
});

router.post(
  "/gaa/escalations/:id/resolve",
  adminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = ResolveEscalationBody.safeParse(req.body);
    if (!Number.isFinite(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const result = await resolveEscalation({
      escalationId: id,
      decision: parsed.data.decision,
      resolvedBy: `user:${req.user?.userId ?? "unknown"}`,
      resolution: parsed.data.resolution,
    });
    if (!result) {
      res.status(404).json({ error: "Escalation not found" });
      return;
    }
    res.json(result);
  },
);

// --- Action ledger ---------------------------------------------------------
router.get("/gaa/ledger", adminOnly, async (req, res): Promise<void> => {
  const goalId =
    typeof req.query.goalId === "string" ? Number(req.query.goalId) : undefined;
  const rows = await listLedger(goalId);
  res.json(rows);
});

router.post(
  "/gaa/ledger/:id/rollback",
  adminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid ledger id" });
      return;
    }
    const result = await rollbackAction(
      id,
      `user:${req.user?.userId ?? "unknown"}`,
    );
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json(result);
  },
);

// --- Cost envelope ---------------------------------------------------------
router.get("/gaa/cost/:goalId", adminOnly, async (req, res): Promise<void> => {
  const goalId = Number(req.params.goalId);
  if (!Number.isFinite(goalId)) {
    res.status(400).json({ error: "Invalid goal id" });
    return;
  }
  const burn = await getBurnState(goalId);
  res.json(burn ?? { goalId, burnedCents: 0, envelopeCents: null });
});

// --- Constitution ----------------------------------------------------------
router.get("/gaa/constitution", adminOnly, async (_req, res): Promise<void> => {
  const principles = await getConstitution();
  res.json(principles);
});

// --- Memory ----------------------------------------------------------------
router.get("/gaa/memory", adminOnly, async (req, res): Promise<void> => {
  const scope =
    req.query.scope === "client" || req.query.scope === "platform"
      ? req.query.scope
      : undefined;
  const clientId =
    typeof req.query.clientId === "string"
      ? Number(req.query.clientId)
      : undefined;
  const rows = await recall({ scope, clientId, limit: 100 });
  res.json(rows);
});

// GDPR right-to-erasure: purge all GAA memory for a client on demand.
router.post(
  "/gaa/memory/forget/:clientId",
  adminOnly,
  async (req, res): Promise<void> => {
    const clientId = Number(req.params.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      res.status(400).json({ error: "Valid clientId is required." });
      return;
    }
    const deleted = await forgetClient(clientId);
    await recordAuditEvent({
      eventType: "gdpr_erase",
      decision: "allow",
      detail: `Erased ${deleted} GAA memory record(s) for client #${clientId} on request.`,
    });
    res.json({ clientId, deleted });
  },
);

// --- Conflicts -------------------------------------------------------------
router.get("/gaa/conflicts", adminOnly, async (_req, res): Promise<void> => {
  const conflicts = await detectConflicts();
  res.json(
    conflicts.map((c) => ({
      goalAId: c.goalA.id,
      goalATitle: c.goalA.title,
      goalBId: c.goalB.id,
      goalBTitle: c.goalB.title,
      conflictType: c.conflictType,
      overlap: c.overlap,
    })),
  );
});

// --- Dead letters ----------------------------------------------------------
router.get("/gaa/dead-letters", adminOnly, async (_req, res): Promise<void> => {
  const rows = await listDeadLetters();
  res.json(rows);
});

router.post(
  "/gaa/dead-letters/:id/revive",
  adminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid goal id" });
      return;
    }
    const revived = await reviveDeadLetter(id);
    if (!revived) {
      res.status(404).json({ error: "Dead-letter goal not found" });
      return;
    }
    res.json(revived);
  },
);

// --- Manual tick -----------------------------------------------------------
router.post("/gaa/tick", adminOnly, async (_req, res): Promise<void> => {
  const summary = await runGaaCycle();
  res.json(summary);
});

export default router;
