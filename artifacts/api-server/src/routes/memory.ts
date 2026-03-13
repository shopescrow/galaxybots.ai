import { Router, type IRouter } from "express";
import {
  db,
  botMemoriesTable,
  botAssignmentsTable,
  backgroundReportsTable,
  botsTable,
  taskSessionsTable,
  taskSessionBotsTable,
  taskSessionMessagesTable,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  storeMemory,
  retrieveMemories,
  consolidateSession,
  getMemoriesForBot,
  deleteMemory,
} from "../services/memory";
import { openai } from "@workspace/integrations-openai-ai-server";
import { addSSEClient, broadcastSSE } from "../services/scheduler";

const router: IRouter = Router();

router.get("/bots/:botId/memories", async (req, res): Promise<void> => {
  const botId = parseInt(req.params.botId);
  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid bot ID" });
    return;
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
  const memories = await getMemoriesForBot(botId, limit);
  res.json(memories);
});

router.delete("/memories/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid memory ID" });
    return;
  }

  await deleteMemory(id);
  res.json({ success: true });
});

router.post("/bots/:botId/memories/search", async (req, res): Promise<void> => {
  const botId = parseInt(req.params.botId);
  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid bot ID" });
    return;
  }

  const { query, limit } = req.body;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query string required" });
    return;
  }

  const memories = await retrieveMemories({ botId, query, limit });
  res.json(memories);
});

router.post("/task-sessions/:id/consolidate", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.id);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(taskSessionsTable)
    .where(eq(taskSessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const sessionBotRows = await db
    .select()
    .from(taskSessionBotsTable)
    .where(eq(taskSessionBotsTable.sessionId, sessionId));
  const botIds = sessionBotRows.map((sb) => sb.botId);

  const msgs = await db
    .select()
    .from(taskSessionMessagesTable)
    .where(eq(taskSessionMessagesTable.sessionId, sessionId))
    .orderBy(taskSessionMessagesTable.createdAt);

  const result = await consolidateSession({
    sessionId,
    objective: session.objective,
    messages: msgs,
    botIds,
  });

  res.json(result);
});

router.get("/bot-assignments", async (_req, res): Promise<void> => {
  const assignments = await db
    .select({
      id: botAssignmentsTable.id,
      botId: botAssignmentsTable.botId,
      objective: botAssignmentsTable.objective,
      schedule: botAssignmentsTable.schedule,
      isActive: botAssignmentsTable.isActive,
      lastRunAt: botAssignmentsTable.lastRunAt,
      createdAt: botAssignmentsTable.createdAt,
      botName: botsTable.name,
      botTitle: botsTable.title,
    })
    .from(botAssignmentsTable)
    .leftJoin(botsTable, eq(botAssignmentsTable.botId, botsTable.id))
    .orderBy(desc(botAssignmentsTable.createdAt));

  res.json(assignments);
});

router.post("/bot-assignments", async (req, res): Promise<void> => {
  const { botId, objective, schedule } = req.body;
  if (!botId || !objective) {
    res.status(400).json({ error: "botId and objective are required" });
    return;
  }

  const validSchedules = ["hourly", "daily", "weekly"];
  if (schedule && !validSchedules.includes(schedule)) {
    res.status(400).json({ error: `Invalid schedule. Must be one of: ${validSchedules.join(", ")}` });
    return;
  }

  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, botId));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const [assignment] = await db
    .insert(botAssignmentsTable)
    .values({
      botId,
      objective,
      schedule: schedule || "daily",
    })
    .returning();

  res.status(201).json(assignment);
});

router.patch("/bot-assignments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid assignment ID" });
    return;
  }

  const { isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (typeof isActive === "string") updates.isActive = isActive;

  const [updated] = await db
    .update(botAssignmentsTable)
    .set(updates)
    .where(eq(botAssignmentsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  res.json(updated);
});

router.delete("/bot-assignments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid assignment ID" });
    return;
  }

  await db
    .delete(botAssignmentsTable)
    .where(eq(botAssignmentsTable.id, id));
  res.json({ success: true });
});

router.get("/background-reports", async (req, res): Promise<void> => {
  const botId = req.query.botId ? parseInt(req.query.botId as string) : null;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

  let query = db
    .select({
      id: backgroundReportsTable.id,
      assignmentId: backgroundReportsTable.assignmentId,
      botId: backgroundReportsTable.botId,
      content: backgroundReportsTable.content,
      summary: backgroundReportsTable.summary,
      deliveredAt: backgroundReportsTable.deliveredAt,
      createdAt: backgroundReportsTable.createdAt,
      botName: botsTable.name,
      botTitle: botsTable.title,
      objective: botAssignmentsTable.objective,
    })
    .from(backgroundReportsTable)
    .leftJoin(botsTable, eq(backgroundReportsTable.botId, botsTable.id))
    .leftJoin(botAssignmentsTable, eq(backgroundReportsTable.assignmentId, botAssignmentsTable.id))
    .orderBy(desc(backgroundReportsTable.createdAt))
    .limit(limit);

  if (botId) {
    const results = await db
      .select({
        id: backgroundReportsTable.id,
        assignmentId: backgroundReportsTable.assignmentId,
        botId: backgroundReportsTable.botId,
        content: backgroundReportsTable.content,
        summary: backgroundReportsTable.summary,
        deliveredAt: backgroundReportsTable.deliveredAt,
        createdAt: backgroundReportsTable.createdAt,
        botName: botsTable.name,
        botTitle: botsTable.title,
        objective: botAssignmentsTable.objective,
      })
      .from(backgroundReportsTable)
      .leftJoin(botsTable, eq(backgroundReportsTable.botId, botsTable.id))
      .leftJoin(botAssignmentsTable, eq(backgroundReportsTable.assignmentId, botAssignmentsTable.id))
      .where(eq(backgroundReportsTable.botId, botId))
      .orderBy(desc(backgroundReportsTable.createdAt))
      .limit(limit);
    res.json(results);
    return;
  }

  const results = await query;
  res.json(results);
});

router.post("/bot-assignments/:id/run", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid assignment ID" });
    return;
  }

  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.id, id));
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, assignment.botId));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}

You have been assigned an ongoing monitoring responsibility. Produce a professional briefing report on the current status of your assigned objective. Be specific, insightful, and actionable.`,
      },
      {
        role: "user",
        content: `STANDING OBJECTIVE: ${assignment.objective}\n\nProduce your periodic briefing report.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "Report generation failed.";

  const summaryCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content: "Summarize the following report in one concise sentence.",
      },
      { role: "user", content },
    ],
  });

  const summary = summaryCompletion.choices[0]?.message?.content ?? content.substring(0, 200);

  const [report] = await db
    .insert(backgroundReportsTable)
    .values({
      assignmentId: assignment.id,
      botId: assignment.botId,
      content,
      summary,
      deliveredAt: new Date(),
    })
    .returning();

  await db
    .update(botAssignmentsTable)
    .set({ lastRunAt: new Date() })
    .where(eq(botAssignmentsTable.id, id));

  broadcastSSE("background-report", {
    reportId: report.id,
    assignmentId: assignment.id,
    botId: bot.id,
    botName: bot.name,
    summary,
  });

  res.status(201).json(report);
});

router.get("/events/background", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const clientId = `sse-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  addSSEClient(clientId, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  req.on("close", () => {
    res.end();
  });
});

export default router;
