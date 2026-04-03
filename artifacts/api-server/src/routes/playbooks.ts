import { Router, type IRouter } from "express";
import { db, missionPlaybooksTable, clientsTable, botMessagesTable } from "@workspace/db";
import { eq, desc, and, ne } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router: IRouter = Router();

router.get("/playbooks", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  const playbooks = await db
    .select()
    .from(missionPlaybooksTable)
    .orderBy(missionPlaybooksTable.createdAt);

  res.json(playbooks);
});

router.get("/playbooks/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid playbook ID" });
    return;
  }

  const [playbook] = await db
    .select()
    .from(missionPlaybooksTable)
    .where(eq(missionPlaybooksTable.id, id));

  if (!playbook) {
    res.status(404).json({ error: "Playbook not found" });
    return;
  }

  res.json(playbook);
});

router.post("/playbooks", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const { name, description, category, steps } = req.body as {
    name?: string;
    description?: string;
    category?: string;
    steps?: Array<{ order: number; role: string; objective: string }>;
  };

  if (!name || !name.trim()) {
    res.status(400).json({ error: "Playbook name is required" });
    return;
  }

  const stepsValue = Array.isArray(steps) ? steps : [];

  const [created] = await db
    .insert(missionPlaybooksTable)
    .values({
      name: name.trim(),
      description: description?.trim() ?? "",
      category: category?.trim() || "custom",
      isBuiltIn: false,
      steps: stepsValue,
    })
    .returning();

  res.status(201).json(created);
});

router.put("/playbooks/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid playbook ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(missionPlaybooksTable)
    .where(eq(missionPlaybooksTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Playbook not found" });
    return;
  }

  if (existing.isBuiltIn) {
    res.status(403).json({ error: "Built-in playbooks cannot be modified" });
    return;
  }

  const { name, description, category, steps } = req.body as {
    name?: string;
    description?: string;
    category?: string;
    steps?: Array<{ order: number; role: string; objective: string }>;
  };

  const [updated] = await db
    .update(missionPlaybooksTable)
    .set({
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(category !== undefined && { category: category.trim() }),
      ...(steps !== undefined && { steps }),
    })
    .where(eq(missionPlaybooksTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/playbooks/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid playbook ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(missionPlaybooksTable)
    .where(eq(missionPlaybooksTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Playbook not found" });
    return;
  }

  if (existing.isBuiltIn) {
    res.status(403).json({ error: "Built-in playbooks cannot be deleted" });
    return;
  }

  await db.delete(missionPlaybooksTable).where(eq(missionPlaybooksTable.id, id));

  res.json({ success: true });
});

router.get("/governance/mode", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const [client] = await db
    .select({ governanceMode: clientsTable.governanceMode })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  res.json({ governanceMode: (client as { governanceMode?: string } | undefined)?.governanceMode ?? "approval_all" });
});

router.put("/governance/mode", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { governanceMode } = req.body as { governanceMode: string };

  if (!["approval_all", "exception_only", "observe_only"].includes(governanceMode)) {
    res.status(400).json({ error: "Invalid governance mode. Must be approval_all, exception_only, or observe_only." });
    return;
  }

  await db
    .update(clientsTable)
    .set({ governanceMode })
    .where(eq(clientsTable.id, clientId));

  res.json({ governanceMode });
});

router.get("/task-sessions/:sessionId/bot-messages", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const sessionId = Number(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const botMsgs = await db
    .select()
    .from(botMessagesTable)
    .where(eq(botMessagesTable.sessionId, sessionId))
    .orderBy(botMessagesTable.createdAt);

  res.json(botMsgs);
});

export default router;
