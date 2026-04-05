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
} from "../../services/bots/memory";
import { openai } from "@workspace/integrations-openai-ai-server";
import { addSSEClient, broadcastSSE } from "../../services/platform/scheduler";
import { createNotification } from "../../services/admin/notifications";
import { runAgenticLoop } from "../../tools/agentic-loop";

const router: IRouter = Router();

router.get("/bots/:botId/memories", async (req, res): Promise<void> => {
  const botId = parseInt(req.params.botId);
  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid bot ID" });
    return;
  }

  const tenantClientId = req.user!.clientId;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
  const memories = await getMemoriesForBot(botId, limit, tenantClientId);
  res.json(memories);
});

router.delete("/memories/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid memory ID" });
    return;
  }

  const [memory] = await db.select().from(botMemoriesTable).where(
    and(eq(botMemoriesTable.id, id), eq(botMemoriesTable.clientId, req.user!.clientId))
  );
  if (!memory) {
    res.status(404).json({ error: "Memory not found" });
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

  const memories = await retrieveMemories({ botId, clientId: req.user!.clientId, query, limit });
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
    .where(and(eq(taskSessionsTable.id, sessionId), eq(taskSessionsTable.clientId, req.user!.clientId)));
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
    clientId: req.user!.clientId,
    objective: session.objective,
    messages: msgs,
    botIds,
  });

  res.json(result);
});

router.get("/bot-assignments", async (req, res): Promise<void> => {
  const assignments = await db
    .select({
      id: botAssignmentsTable.id,
      botId: botAssignmentsTable.botId,
      clientId: botAssignmentsTable.clientId,
      objective: botAssignmentsTable.objective,
      schedule: botAssignmentsTable.schedule,
      isActive: botAssignmentsTable.isActive,
      actionMode: botAssignmentsTable.actionMode,
      actionPrompt: botAssignmentsTable.actionPrompt,
      lastRunAt: botAssignmentsTable.lastRunAt,
      createdAt: botAssignmentsTable.createdAt,
      botName: botsTable.name,
      botTitle: botsTable.title,
    })
    .from(botAssignmentsTable)
    .leftJoin(botsTable, eq(botAssignmentsTable.botId, botsTable.id))
    .where(eq(botAssignmentsTable.clientId, req.user!.clientId))
    .orderBy(desc(botAssignmentsTable.createdAt));

  res.json(assignments);
});

router.post("/bot-assignments", async (req, res): Promise<void> => {
  const { botId, objective, schedule, actionMode, actionPrompt } = req.body;
  if (!botId || !objective) {
    res.status(400).json({ error: "botId and objective are required" });
    return;
  }

  const validSchedules = ["hourly", "daily", "weekly"];
  if (schedule && !validSchedules.includes(schedule)) {
    res.status(400).json({ error: `Invalid schedule. Must be one of: ${validSchedules.join(", ")}` });
    return;
  }

  const validModes = ["passive", "active"];
  if (actionMode && !validModes.includes(actionMode)) {
    res.status(400).json({ error: `Invalid actionMode. Must be one of: ${validModes.join(", ")}` });
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
      clientId: req.user!.clientId,
      objective,
      schedule: schedule || "daily",
      actionMode: actionMode || "passive",
      actionPrompt: actionPrompt || null,
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

  const { isActive, actionMode, actionPrompt, schedule } = req.body;

  const validModes = ["passive", "active"];
  if (actionMode !== undefined && (typeof actionMode !== "string" || !validModes.includes(actionMode))) {
    res.status(400).json({ error: `Invalid actionMode. Must be one of: ${validModes.join(", ")}` });
    return;
  }

  const validSchedules = ["hourly", "daily", "weekly"];
  if (schedule !== undefined && (typeof schedule !== "string" || !validSchedules.includes(schedule))) {
    res.status(400).json({ error: `Invalid schedule. Must be one of: ${validSchedules.join(", ")}` });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (typeof isActive === "string") updates.isActive = isActive;
  if (actionMode) updates.actionMode = actionMode;
  if (actionPrompt === null) updates.actionPrompt = null;
  else if (typeof actionPrompt === "string") updates.actionPrompt = actionPrompt;
  if (schedule) updates.schedule = schedule;

  const [updated] = await db
    .update(botAssignmentsTable)
    .set(updates)
    .where(and(eq(botAssignmentsTable.id, id), eq(botAssignmentsTable.clientId, req.user!.clientId)))
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

  const [deleted] = await db
    .delete(botAssignmentsTable)
    .where(and(eq(botAssignmentsTable.id, id), eq(botAssignmentsTable.clientId, req.user!.clientId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  res.json({ success: true });
});

router.get("/background-reports", async (req, res): Promise<void> => {
  const botId = req.query.botId ? parseInt(req.query.botId as string) : null;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
  const tenantClientId = req.user!.clientId;

  const conditions = [eq(backgroundReportsTable.clientId, tenantClientId)];
  if (botId) {
    conditions.push(eq(backgroundReportsTable.botId, botId));
  }

  const results = await db
    .select({
      id: backgroundReportsTable.id,
      assignmentId: backgroundReportsTable.assignmentId,
      botId: backgroundReportsTable.botId,
      content: backgroundReportsTable.content,
      summary: backgroundReportsTable.summary,
      runStatus: backgroundReportsTable.runStatus,
      deliveredAt: backgroundReportsTable.deliveredAt,
      createdAt: backgroundReportsTable.createdAt,
      botName: botsTable.name,
      botTitle: botsTable.title,
      objective: botAssignmentsTable.objective,
    })
    .from(backgroundReportsTable)
    .leftJoin(botsTable, eq(backgroundReportsTable.botId, botsTable.id))
    .leftJoin(botAssignmentsTable, eq(backgroundReportsTable.assignmentId, botAssignmentsTable.id))
    .where(and(...conditions))
    .orderBy(desc(backgroundReportsTable.createdAt))
    .limit(limit);

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
    .where(and(eq(botAssignmentsTable.id, id), eq(botAssignmentsTable.clientId, req.user!.clientId)));
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

  let content: string;
  let summary: string;
  let runStatus: "success" | "partial" | "failed" = "success";

  if (assignment.actionMode === "active") {
    const missionPrompt = assignment.actionPrompt || assignment.objective;
    const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}

You are executing a standing order autonomously. Use your available tools to complete the mission objective below. Take real actions — post messages, send emails, create documents, look up data — whatever is needed to fulfill the order. When done, provide a concise summary of what you accomplished.`;

    const result = await runAgenticLoop({
      model: "gpt-4o-mini", // high-volume memory extraction, cost-efficient
      maxIterations: 10,
      maxTokens: 1500,
      systemPrompt,
      messages: [
        {
          role: "user",
          content: `STANDING ORDER: ${missionPrompt}\n\nExecute this order now using your available tools. Report back on what you accomplished.`,
        },
      ],
      context: {
        clientId: req.user!.clientId,
        botId: bot.id,
        botName: bot.name,
      },
    });

    const hasError = result.events.some((e) => e.type === "error");
    const hasToolBlocked = result.events.some((e) => e.type === "tool_blocked");
    if (hasError && !result.finalContent) {
      runStatus = "failed";
    } else if (hasError || hasToolBlocked || result.paused) {
      runStatus = "partial";
    }

    content = result.finalContent || "Active execution completed but produced no output.";

    const summaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // high-volume summarization, cost-efficient
      max_completion_tokens: 200,
      messages: [
        { role: "system", content: "Summarize the following execution report in one concise sentence." },
        { role: "user", content },
      ],
    });
    summary = summaryCompletion.choices[0]?.message?.content ?? content.substring(0, 200);
  } else {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // high-volume memory extraction, cost-efficient
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

    content = completion.choices[0]?.message?.content ?? "Report generation failed.";

    const summaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // high-volume summarization, cost-efficient
      max_completion_tokens: 200,
      messages: [
        { role: "system", content: "Summarize the following report in one concise sentence." },
        { role: "user", content },
      ],
    });
    summary = summaryCompletion.choices[0]?.message?.content ?? content.substring(0, 200);
  }

  const [report] = await db
    .insert(backgroundReportsTable)
    .values({
      assignmentId: assignment.id,
      botId: assignment.botId,
      clientId: req.user!.clientId,
      content,
      summary,
      runStatus,
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
    clientId: req.user!.clientId,
    summary,
    runStatus,
  });

  createNotification({
    clientId: req.user!.clientId,
    category: "bot",
    severity: "info",
    title: `Background report from ${bot.name}`,
    body: summary,
    link: "/command-center",
    metadata: { reportId: report.id, botId: bot.id },
  }).catch((e) => console.error("[notifications] Failed to create background-report notification:", e));

  if (runStatus === "failed" || runStatus === "partial") {
    broadcastSSE("assignment-alert", {
      reportId: report.id,
      assignmentId: assignment.id,
      botId: bot.id,
      botName: bot.name,
      clientId: req.user!.clientId,
      runStatus,
      summary,
      message: runStatus === "failed"
        ? `Standing order failed for ${bot.name}: ${summary}`
        : `Standing order partially completed by ${bot.name}: ${summary}`,
    });

    createNotification({
      clientId: req.user!.clientId,
      category: "bot",
      severity: runStatus === "failed" ? "critical" : "warning",
      title: runStatus === "failed"
        ? `Standing order failed for ${bot.name}`
        : `Standing order partially completed by ${bot.name}`,
      body: summary,
      link: "/bots",
      metadata: { reportId: report.id, assignmentId: assignment.id, botId: bot.id },
    }).catch((e) => console.error("[notifications] Failed to create assignment-alert notification:", e));
  }

  res.status(201).json(report);
});

router.get("/events/background", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const sseId = `sse-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const tenantClientId = req.user!.clientId;
  addSSEClient(sseId, res, tenantClientId);

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId: sseId })}\n\n`);

  req.on("close", () => {
    res.end();
  });
});

export default router;
