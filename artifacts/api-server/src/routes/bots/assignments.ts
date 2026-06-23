import { Router, type IRouter } from "express";
import {
  db,
  botAssignmentsTable,
  goalConflictsTable,
  opportunitySignalsTable,
  botHandoffRequestsTable,
  uncertaintySchedulesTable,
  causalOutcomesTable,
  syntheticControlsTable,
} from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { decomposeGoal } from "../../services/platform/jobs/goal-decomposition";
import { checkGoalConflicts } from "../../services/platform/jobs/goal-conflict-resolver";
import { emitBotHandoffRequest } from "../../services/platform/jobs/bot-handoff";

function requireOwnerOrAdmin(req: import("express").Request, res: import("express").Response): boolean {
  const role = req.user?.role;
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "Owner or admin role required" });
    return false;
  }
  return true;
}

const router: IRouter = Router();

router.get("/assignments/autonomous", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const assignments = await db
    .select()
    .from(botAssignmentsTable)
    .where(
      and(
        eq(botAssignmentsTable.clientId, clientId),
        eq(botAssignmentsTable.generatedBy, "autonomous"),
      ),
    )
    .orderBy(desc(botAssignmentsTable.createdAt))
    .limit(50);
  res.json(assignments);
});

router.get("/assignments/:id/sub-tasks", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(
      and(
        eq(botAssignmentsTable.id, id),
        eq(botAssignmentsTable.clientId, req.user!.clientId),
      ),
    );
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ subTasks: assignment.subTasks ?? [], progressScore: assignment.progressScore });
});

router.post("/assignments/:id/decompose", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(
      and(
        eq(botAssignmentsTable.id, id),
        eq(botAssignmentsTable.clientId, req.user!.clientId),
      ),
    );
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }

  await decomposeGoal(id);
  const [updated] = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.id, id));
  res.json({ subTasks: updated?.subTasks ?? [], progressScore: updated?.progressScore ?? 0 });
});

router.put("/assignments/:id/sub-tasks/:taskId/status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { taskId } = req.params;
  const { status } = req.body;

  if (isNaN(id) || !taskId) { res.status(400).json({ error: "Invalid params" }); return; }

  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(
      and(
        eq(botAssignmentsTable.id, id),
        eq(botAssignmentsTable.clientId, req.user!.clientId),
      ),
    );
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }

  const subTasks = (assignment.subTasks ?? []).map((t: { id: string; title: string; dependsOn: string[]; status: string; completedAt?: string }) =>
    t.id === taskId
      ? { ...t, status, completedAt: status === "done" ? new Date().toISOString() : t.completedAt }
      : t,
  );

  const done = subTasks.filter((t: { status: string }) => t.status === "done").length;
  const progressScore = subTasks.length > 0 ? Math.round((done / subTasks.length) * 100) : 0;

  await db
    .update(botAssignmentsTable)
    .set({ subTasks, progressScore })
    .where(eq(botAssignmentsTable.id, id));

  res.json({ subTasks, progressScore });
});

router.get("/goal-conflicts", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const conflicts = await db
    .select()
    .from(goalConflictsTable)
    .where(eq(goalConflictsTable.clientId, clientId))
    .orderBy(desc(goalConflictsTable.createdAt))
    .limit(50);

  res.json(conflicts);
});

router.get("/opportunity-signals", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const status = req.query.status as string | undefined;

  const signals = await db
    .select()
    .from(opportunitySignalsTable)
    .where(
      and(
        eq(opportunitySignalsTable.clientId, clientId),
        status ? eq(opportunitySignalsTable.status, status) : undefined,
      ),
    )
    .orderBy(desc(opportunitySignalsTable.detectedAt))
    .limit(20);

  res.json(signals);
});

router.post("/opportunity-signals/:id/approve", async (req, res): Promise<void> => {
  if (!requireOwnerOrAdmin(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [signal] = await db
    .select()
    .from(opportunitySignalsTable)
    .where(
      and(
        eq(opportunitySignalsTable.id, id),
        eq(opportunitySignalsTable.clientId, req.user!.clientId),
      ),
    );
  if (!signal) { res.status(404).json({ error: "Not found" }); return; }

  const [assignment] = await db
    .insert(botAssignmentsTable)
    .values({
      botId: signal.botId!,
      clientId: signal.clientId,
      objective: signal.suggestedAction,
      schedule: "weekly",
      isActive: "true",
      actionMode: "active",
      actionPrompt: `${signal.suggestedAction}\n\nContext: ${signal.description}`,
      generatedBy: "autonomous",
      priorityTier: signal.signalType === "churn_precursor" ? 1 : 2,
      evidenceChain: signal.evidenceChain ?? [],
    })
    .returning();

  await db
    .update(opportunitySignalsTable)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedByUserId: req.user!.id,
      resultingAssignmentId: assignment.id,
    })
    .where(eq(opportunitySignalsTable.id, id));

  decomposeGoal(assignment.id).catch((err) =>
    console.error(`[opp-approve] decomposeGoal error for assignment ${assignment.id}:`, err),
  );
  checkGoalConflicts(assignment.id).catch((err) =>
    console.error(`[opp-approve] checkGoalConflicts error for assignment ${assignment.id}:`, err),
  );

  res.json({ success: true, assignmentId: assignment.id });
});

router.post("/opportunity-signals/:id/dismiss", async (req, res): Promise<void> => {
  if (!requireOwnerOrAdmin(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  await db
    .update(opportunitySignalsTable)
    .set({ status: "dismissed", dismissedAt: new Date() })
    .where(
      and(
        eq(opportunitySignalsTable.id, id),
        eq(opportunitySignalsTable.clientId, req.user!.clientId),
      ),
    );

  res.json({ success: true });
});

router.post("/bot-handoff", async (req, res): Promise<void> => {
  const {
    sourceBotId,
    reason,
    terminationReason,
    context,
    recommendedRecipientName,
    sessionId,
    assignmentId,
  } = req.body;

  if (!sourceBotId || !reason || !terminationReason) {
    res.status(400).json({ error: "sourceBotId, reason, terminationReason required" });
    return;
  }

  const clientId = req.user!.clientId;
  const [ownershipCheck] = await db
    .select({ id: botAssignmentsTable.id })
    .from(botAssignmentsTable)
    .where(
      and(
        eq(botAssignmentsTable.botId, sourceBotId),
        eq(botAssignmentsTable.clientId, clientId),
      ),
    )
    .limit(1);

  if (!ownershipCheck) {
    res.status(403).json({ error: "sourceBotId does not belong to your account" });
    return;
  }

  await emitBotHandoffRequest({
    sourceBotId,
    clientId: req.user!.clientId,
    sessionId,
    assignmentId,
    reason,
    terminationReason,
    context: context ?? {},
    recommendedRecipientName,
  });

  res.json({ success: true });
});

router.get("/bot-handoffs", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const handoffs = await db
    .select()
    .from(botHandoffRequestsTable)
    .where(eq(botHandoffRequestsTable.clientId, clientId))
    .orderBy(desc(botHandoffRequestsTable.createdAt))
    .limit(30);
  res.json(handoffs);
});

router.get("/uncertainty-schedules", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const schedules = await db
    .select()
    .from(uncertaintySchedulesTable)
    .where(eq(uncertaintySchedulesTable.clientId, clientId))
    .orderBy(desc(uncertaintySchedulesTable.createdAt))
    .limit(30);
  res.json(schedules);
});

export default router;
