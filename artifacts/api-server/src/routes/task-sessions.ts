import { Router, type IRouter } from "express";
import {
  db,
  botsTable,
  taskSessionsTable,
  taskSessionBotsTable,
  taskSessionMessagesTable,
  guestSessionsTable,
} from "@workspace/db";
import { eq, desc, inArray, and, gt } from "drizzle-orm";
import { captureSessionOutcome } from "../services/outcome-capture";
import { getPackOverlayForBot } from "../services/pack-overlays";
import {
  AnalyzeTaskBody,
  CreateTaskSessionBody,
  SendTaskSessionMessageBody,
  GetTaskSessionParams,
  GetTaskSessionMessagesParams,
  SendTaskSessionMessageParams,
  GetTaskSessionAlertsParams,
  ExpandTaskSessionParams,
  ExpandTaskSessionBody,
  FabricateBotBody,
} from "@workspace/api-zod";
import { openai, batchProcessWithSSE } from "@workspace/integrations-openai-ai-server";
import { runAgenticLoop, type AgenticEvent } from "../tools";
import { buildMemoryContext } from "../services/memory";
import { buildKnowledgeBaseContext } from "../services/knowledge-base";
import { requireRole } from "../middleware/auth";
import { llmRateLimit } from "../middleware/rate-limit";

import { buildClientContext } from "../services/client-context";
import { applyBrandVoiceGuardrails } from "../services/governance";

const router: IRouter = Router();

async function verifyGuestAccess(req: Express.Request, taskSessionId: number): Promise<boolean> {
  if (req.user?.role !== "guest" || !req.user.guestSessionId) return true;
  const [gs] = await db
    .select()
    .from(guestSessionsTable)
    .where(
      and(
        eq(guestSessionsTable.id, req.user.guestSessionId),
        eq(guestSessionsTable.taskSessionId, taskSessionId),
        eq(guestSessionsTable.status, "active"),
        gt(guestSessionsTable.expiresAt, new Date())
      )
    );
  return !!gs;
}

async function getSessionWithBots(sessionId: number) {
  const [session] = await db
    .select()
    .from(taskSessionsTable)
    .where(eq(taskSessionsTable.id, sessionId));

  if (!session) return null;

  const sessionBotRows = await db
    .select()
    .from(taskSessionBotsTable)
    .where(eq(taskSessionBotsTable.sessionId, sessionId));

  const botIds = sessionBotRows.map((sb) => sb.botId);
  let teamBots: (typeof botsTable.$inferSelect)[] = [];
  if (botIds.length > 0) {
    teamBots = await db
      .select()
      .from(botsTable)
      .where(inArray(botsTable.id, botIds));
  }

  return { ...session, teamBots };
}

router.post("/task-sessions/analyze", requireRole("owner", "admin"), llmRateLimit, async (req, res): Promise<void> => {
  const body = AnalyzeTaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const allBots = await db.select().from(botsTable);

  const botRoster = allBots
    .map(
      (b) =>
        `ID:${b.id} | ${b.name} | ${b.title} | ${b.department} | ${b.responsibilities.join(", ")}`,
    )
    .join("\n");

  const clientContext = await buildClientContext(req.user!.clientId);

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are Optima Prime, a corporate task-force assembler. Given a business task/objective and the existing bot roster, you must:
1. Identify all specialist roles needed for this task
2. Match roles to existing bots from the roster
3. Identify any gaps where no existing bot covers the required expertise
4. For gaps, propose new bot specifications
${clientContext}
Respond in valid JSON with this exact structure:
{
  "matchedBotIds": [1, 2, 3],
  "proposedBots": [
    {
      "name": "Bot Name",
      "title": "Job Title",
      "department": "Department",
      "personality": "Personality description",
      "responsibilities": ["resp1", "resp2"]
    }
  ],
  "reasoning": "Brief explanation of why these roles are needed"
}

Select 3-6 bots total. Only propose new bots if truly no existing bot covers a critical expertise area.`,
      },
      {
        role: "user",
        content: `TASK: ${body.data.objective}\n\nAVAILABLE BOTS:\n${botRoster}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: {
    matchedBotIds: number[];
    proposedBots: Array<{
      name: string;
      title: string;
      department: string;
      personality: string;
      responsibilities: string[];
    }>;
    reasoning: string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { matchedBotIds: [], proposedBots: [], reasoning: "Analysis failed" };
  }

  const matchedBots = allBots.filter((b) =>
    (parsed.matchedBotIds || []).includes(b.id),
  );

  res.json({
    objective: body.data.objective,
    matchedBots,
    proposedBots: parsed.proposedBots || [],
    reasoning: parsed.reasoning || "",
  });
});

router.post("/bots/fabricate", requireRole("owner", "admin"), llmRateLimit, async (req, res): Promise<void> => {
  const body = FabricateBotBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [bot] = await db
    .insert(botsTable)
    .values({
      name: body.data.name,
      title: body.data.title,
      department: body.data.department,
      category: body.data.category,
      description: body.data.description,
      responsibilities: body.data.responsibilities,
      personality: body.data.personality,
      isAvailable: true,
      isAiGenerated: true,
    })
    .returning();

  res.status(201).json(bot);
});

router.get("/task-sessions", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const sessions = await db
    .select()
    .from(taskSessionsTable)
    .where(eq(taskSessionsTable.clientId, clientId))
    .orderBy(desc(taskSessionsTable.createdAt));

  const result = await Promise.all(
    sessions.map(async (s) => {
      const sessionBotRows = await db
        .select()
        .from(taskSessionBotsTable)
        .where(eq(taskSessionBotsTable.sessionId, s.id));
      const botIds = sessionBotRows.map((sb) => sb.botId);
      let teamBots: (typeof botsTable.$inferSelect)[] = [];
      if (botIds.length > 0) {
        teamBots = await db
          .select()
          .from(botsTable)
          .where(inArray(botsTable.id, botIds));
      }
      return { ...s, teamBots };
    }),
  );

  res.json(result);
});

router.post("/task-sessions", requireRole("owner", "admin"), llmRateLimit, async (req, res): Promise<void> => {
  const body = CreateTaskSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.botIds.length > 0) {
    const existingBots = await db
      .select({ id: botsTable.id })
      .from(botsTable)
      .where(inArray(botsTable.id, body.data.botIds));
    const validIds = new Set(existingBots.map((b) => b.id));
    const invalidIds = body.data.botIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      res.status(400).json({ error: `Invalid bot IDs: ${invalidIds.join(", ")}` });
      return;
    }
  }

  const [session] = await db
    .insert(taskSessionsTable)
    .values({ objective: body.data.objective, clientId: req.user!.clientId })
    .returning();

  if (body.data.botIds.length > 0) {
    const uniqueBotIds = [...new Set(body.data.botIds)];
    await db.insert(taskSessionBotsTable).values(
      uniqueBotIds.map((botId) => ({
        sessionId: session.id,
        botId,
      })),
    );
  }

  const result = await getSessionWithBots(session.id);
  res.status(201).json(result);
});

router.get("/task-sessions/:id", async (req, res): Promise<void> => {
  const params = GetTaskSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await getSessionWithBots(params.data.id);
  if (!result || result.clientId !== req.user!.clientId) {
    res.status(404).json({ error: "Task session not found" });
    return;
  }

  res.json(result);
});

router.get("/task-sessions/:id/messages", async (req, res): Promise<void> => {
  const params = GetTaskSessionMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db
    .select()
    .from(taskSessionsTable)
    .where(and(eq(taskSessionsTable.id, params.data.id), eq(taskSessionsTable.clientId, req.user!.clientId)));
  if (!session) {
    res.status(404).json({ error: "Task session not found" });
    return;
  }

  if (!(await verifyGuestAccess(req, params.data.id))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const msgs = await db
    .select()
    .from(taskSessionMessagesTable)
    .where(eq(taskSessionMessagesTable.sessionId, params.data.id))
    .orderBy(taskSessionMessagesTable.createdAt);

  res.json(msgs);
});

router.post(
  "/task-sessions/:id/messages",
  llmRateLimit,
  async (req, res): Promise<void> => {
    const params = SendTaskSessionMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = SendTaskSessionMessageBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [session] = await db
      .select()
      .from(taskSessionsTable)
      .where(and(eq(taskSessionsTable.id, params.data.id), eq(taskSessionsTable.clientId, req.user!.clientId)));
    if (!session) {
      res.status(404).json({ error: "Task session not found" });
      return;
    }

    const [userMsg] = await db
      .insert(taskSessionMessagesTable)
      .values({
        sessionId: session.id,
        role: "user",
        content: body.data.content,
        botName: body.data.senderName || "CEO",
        botTitle: "CEO / Architect",
        messageType: "text",
      })
      .returning();

    const sessionBotRows = await db
      .select()
      .from(taskSessionBotsTable)
      .where(eq(taskSessionBotsTable.sessionId, session.id));
    const botIds = sessionBotRows.map((sb) => sb.botId);
    let teamBots: (typeof botsTable.$inferSelect)[] = [];
    if (botIds.length > 0) {
      teamBots = await db
        .select()
        .from(botsTable)
        .where(inArray(botsTable.id, botIds));
    }

    const recentMsgs = await db
      .select()
      .from(taskSessionMessagesTable)
      .where(eq(taskSessionMessagesTable.sessionId, session.id))
      .orderBy(desc(taskSessionMessagesTable.createdAt))
      .limit(10);

    const contextMessages = recentMsgs
      .reverse()
      .map((m) => `${m.botName || "User"}: ${m.content}`)
      .join("\n");

    const responses: (typeof taskSessionMessagesTable.$inferSelect)[] = [
      userMsg,
    ];
    const teamRoster = teamBots
      .map((b) => `${b.name} (${b.title})`)
      .join(", ");

    const clientContext = await buildClientContext(req.user!.clientId);

    let taskKbContext = "";
    try {
      taskKbContext = await buildKnowledgeBaseContext(req.user!.clientId, `${session.objective} ${body.data.content}`);
    } catch (_e) {}

    for (const bot of teamBots) {
      let memoryContext = "";
      try {
        memoryContext = await buildMemoryContext(bot.id, `${session.objective} ${body.data.content}`, req.user!.clientId);
      } catch (_e) {}

      let packOverlay = "";
      try {
        packOverlay = await getPackOverlayForBot(req.user!.clientId, bot.title);
      } catch (_e) {}

      const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department — a master's-level domain expert.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}
${clientContext}${packOverlay}
TASK OBJECTIVE: ${session.objective}
TEAM MEMBERS: ${teamRoster}
${memoryContext}${taskKbContext}
You are participating in a dedicated task session. Respond with deep domain expertise, citing relevant frameworks, standards, regulations, and best practices from your specialty. Keep responses focused and actionable (3-5 sentences).

You have access to tools that allow you to search the web, read/write shared session state, query platform data, and delegate tasks to teammates. Use tools when they would genuinely help you provide better answers. Don't use tools if the question can be answered from your expertise alone.

IMPORTANT: If you identify that this task requires expertise not currently represented on the team, end your response with exactly this format on a new line:
[NEED_ROLE: Role Title - brief reason why this expertise is needed]
Only flag a missing role if it is genuinely critical and not covered by any current team member.`;

      const { finalContent, events } = await runAgenticLoop({
        model: "gpt-5.4",
        maxIterations: 10,
        maxTokens: 500,
        systemPrompt,
        messages: [
          {
            role: "user",
            content: `Recent discussion:\n${contextMessages}\n\nProvide your expert perspective on the latest message.`,
          },
        ],
        context: {
          sessionId: session.id,
          botId: bot.id,
          botName: bot.name,
          clientId: req.user!.clientId,
          userId: req.user!.userId,
          isGuest: req.user!.role === "guest",
        },
      });

      for (const event of events) {
        if (event.type === "tool_call") {
          await db.insert(taskSessionMessagesTable).values({
            sessionId: session.id,
            botId: bot.id,
            botName: bot.name,
            botTitle: bot.title,
            role: "bot",
            content: `Using tool: ${event.toolName}`,
            messageType: "tool_call",
            toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input },
          });
        } else if (event.type === "tool_result") {
          await db.insert(taskSessionMessagesTable).values({
            sessionId: session.id,
            botId: bot.id,
            botName: bot.name,
            botTitle: bot.title,
            role: "bot",
            content: `Tool result: ${event.toolName}`,
            messageType: "tool_result",
            toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, output: event.output },
          });
        }
      }

      const content = finalContent || "Acknowledged. I will incorporate this into my analysis.";

      const flaggedRoles: string[] = [];
      const roleMatch = content.match(/\[NEED_ROLE:\s*(.+?)(?:\s*-\s*.+?)?\]/g);
      if (roleMatch) {
        for (const match of roleMatch) {
          const extracted = match
            .replace(/\[NEED_ROLE:\s*/, "")
            .replace(/\]$/, "");
          flaggedRoles.push(extracted);
        }
      }

      let cleanContent = content.replace(
        /\[NEED_ROLE:\s*.+?\]/g,
        "",
      ).trim();

      if (req.user!.clientId) {
        cleanContent = await applyBrandVoiceGuardrails(req.user!.clientId, cleanContent);
      }

      const [botMsg] = await db
        .insert(taskSessionMessagesTable)
        .values({
          sessionId: session.id,
          botId: bot.id,
          botName: bot.name,
          botTitle: bot.title,
          role: "bot",
          content: cleanContent,
          messageType: "text",
          flaggedRoles,
        })
        .returning();

      responses.push(botMsg);
    }

    const cId = req.body.clientId ? Number(req.body.clientId) : (req.query.clientId ? Number(req.query.clientId) : undefined);
    captureSessionOutcome(session.id, session.objective, cId).catch((err) =>
      console.error("Outcome capture error:", err)
    );

    res.status(201).json(responses);
  },
);

router.post(
  "/task-sessions/:id/messages/stream",
  llmRateLimit,
  async (req, res): Promise<void> => {
    const params = SendTaskSessionMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = SendTaskSessionMessageBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [session] = await db
      .select()
      .from(taskSessionsTable)
      .where(and(eq(taskSessionsTable.id, params.data.id), eq(taskSessionsTable.clientId, req.user!.clientId)));
    if (!session) {
      res.status(404).json({ error: "Task session not found" });
      return;
    }

    if (!(await verifyGuestAccess(req, params.data.id))) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendSSE = (event: { type: string; [key: string]: unknown }) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const [userMsg] = await db
        .insert(taskSessionMessagesTable)
        .values({
          sessionId: session.id,
          role: "user",
          content: body.data.content,
          botName: body.data.senderName || "CEO",
          botTitle: "CEO / Architect",
          messageType: "text",
        })
        .returning();

      sendSSE({ type: "message", content: userMsg.content, botName: userMsg.botName || "CEO" });

      const sessionBotRows = await db
        .select()
        .from(taskSessionBotsTable)
        .where(eq(taskSessionBotsTable.sessionId, session.id));
      const botIds = sessionBotRows.map((sb) => sb.botId);
      let teamBots: (typeof botsTable.$inferSelect)[] = [];
      if (botIds.length > 0) {
        teamBots = await db
          .select()
          .from(botsTable)
          .where(inArray(botsTable.id, botIds));
      }

      const recentMsgs = await db
        .select()
        .from(taskSessionMessagesTable)
        .where(eq(taskSessionMessagesTable.sessionId, session.id))
        .orderBy(desc(taskSessionMessagesTable.createdAt))
        .limit(10);

      const contextMessages = recentMsgs
        .reverse()
        .map((m) => `${m.botName || "User"}: ${m.content}`)
        .join("\n");

      const teamRoster = teamBots
        .map((b) => `${b.name} (${b.title})`)
        .join(", ");

      const clientContext = await buildClientContext(req.user!.clientId);

      let streamTaskKbContext = "";
      try {
        streamTaskKbContext = await buildKnowledgeBaseContext(req.user!.clientId, `${session.objective} ${body.data.content}`);
      } catch (_e) {}

      await batchProcessWithSSE(
        teamBots,
        async (bot) => {
          let packOverlay = "";
          try {
            packOverlay = await getPackOverlayForBot(req.user!.clientId, bot.title);
          } catch (_e) {}

          const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department — a master's-level domain expert.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}
${clientContext}${packOverlay}
TASK OBJECTIVE: ${session.objective}
TEAM MEMBERS: ${teamRoster}
${streamTaskKbContext}
You are participating in a dedicated task session. Respond with deep domain expertise, citing relevant frameworks, standards, regulations, and best practices from your specialty. Keep responses focused and actionable (3-5 sentences).

You have access to tools that allow you to search the web, read/write shared session state, query platform data, and delegate tasks to teammates. Use tools when they would genuinely help you provide better answers. Don't use tools if the question can be answered from your expertise alone.

IMPORTANT: If you identify that this task requires expertise not currently represented on the team, end your response with exactly this format on a new line:
[NEED_ROLE: Role Title - brief reason why this expertise is needed]
Only flag a missing role if it is genuinely critical and not covered by any current team member.`;

          const { finalContent, events } = await runAgenticLoop({
            model: "gpt-5.4",
            maxIterations: 10,
            maxTokens: 500,
            systemPrompt,
            messages: [
              {
                role: "user",
                content: `Recent discussion:\n${contextMessages}\n\nProvide your expert perspective on the latest message.`,
              },
            ],
            context: {
              sessionId: session.id,
              botId: bot.id,
              botName: bot.name,
              clientId: req.user!.clientId,
              userId: req.user!.userId,
              isGuest: req.user!.role === "guest",
            },
            onEvent: (event) => {
              sendSSE({ ...event, botId: bot.id, botName: bot.name, botTitle: bot.title });
            },
          });

          for (const event of events) {
            if (event.type === "tool_call") {
              await db.insert(taskSessionMessagesTable).values({
                sessionId: session.id,
                botId: bot.id,
                botName: bot.name,
                botTitle: bot.title,
                role: "bot",
                content: `Using tool: ${event.toolName}`,
                messageType: "tool_call",
                toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input },
              });
            } else if (event.type === "tool_result") {
              await db.insert(taskSessionMessagesTable).values({
                sessionId: session.id,
                botId: bot.id,
                botName: bot.name,
                botTitle: bot.title,
                role: "bot",
                content: `Tool result: ${event.toolName}`,
                messageType: "tool_result",
                toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, output: event.output },
              });
            }
          }

          const content = finalContent || "Acknowledged. I will incorporate this into my analysis.";

          const flaggedRoles: string[] = [];
          const roleMatch = content.match(/\[NEED_ROLE:\s*(.+?)(?:\s*-\s*.+?)?\]/g);
          if (roleMatch) {
            for (const match of roleMatch) {
              const extracted = match
                .replace(/\[NEED_ROLE:\s*/, "")
                .replace(/\]$/, "");
              flaggedRoles.push(extracted);
            }
          }

          let cleanContent = content.replace(/\[NEED_ROLE:\s*.+?\]/g, "").trim();

          if (req.user!.clientId) {
            cleanContent = await applyBrandVoiceGuardrails(req.user!.clientId, cleanContent);
          }

          await db
            .insert(taskSessionMessagesTable)
            .values({
              sessionId: session.id,
              botId: bot.id,
              botName: bot.name,
              botTitle: bot.title,
              role: "bot",
              content: cleanContent,
              messageType: "text",
              flaggedRoles,
            });

          return { botId: bot.id, content: cleanContent };
        },
        sendSSE,
      );

      sendSSE({ type: "done", content: "All bots have responded" });

      const clientId = req.body.clientId ? Number(req.body.clientId) : (req.query.clientId ? Number(req.query.clientId) : undefined);
      captureSessionOutcome(session.id, session.objective, clientId).catch((err) =>
        console.error("Outcome capture error:", err)
      );
    } catch (err) {
      sendSSE({ type: "error", content: err instanceof Error ? err.message : "Stream error" });
    } finally {
      res.end();
    }
  },
);

router.get(
  "/task-sessions/:id/alerts",
  async (req, res): Promise<void> => {
    const params = GetTaskSessionAlertsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [session] = await db
      .select()
      .from(taskSessionsTable)
      .where(and(eq(taskSessionsTable.id, params.data.id), eq(taskSessionsTable.clientId, req.user!.clientId)));
    if (!session) {
      res.status(404).json({ error: "Task session not found" });
      return;
    }

    const recentMsgs = await db
      .select()
      .from(taskSessionMessagesTable)
      .where(eq(taskSessionMessagesTable.sessionId, params.data.id))
      .orderBy(desc(taskSessionMessagesTable.createdAt))
      .limit(20);

    const alerts: Array<{
      role: string;
      suggestedBy: string;
      messageId: number;
    }> = [];

    for (const msg of recentMsgs) {
      if (msg.flaggedRoles && msg.flaggedRoles.length > 0) {
        for (const role of msg.flaggedRoles) {
          alerts.push({
            role,
            suggestedBy: msg.botName || "Unknown",
            messageId: msg.id,
          });
        }
      }
    }

    res.json(alerts);
  },
);

router.post(
  "/task-sessions/:id/expand",
  async (req, res): Promise<void> => {
    const params = ExpandTaskSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = ExpandTaskSessionBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [session] = await db
      .select()
      .from(taskSessionsTable)
      .where(and(eq(taskSessionsTable.id, params.data.id), eq(taskSessionsTable.clientId, req.user!.clientId)));
    if (!session) {
      res.status(404).json({ error: "Task session not found" });
      return;
    }

    if (body.data.botIds.length > 0) {
      const existingBots = await db
        .select({ id: botsTable.id })
        .from(botsTable)
        .where(inArray(botsTable.id, body.data.botIds));
      const validIds = new Set(existingBots.map((b) => b.id));
      const invalidIds = body.data.botIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        res.status(400).json({ error: `Invalid bot IDs: ${invalidIds.join(", ")}` });
        return;
      }

      const alreadyAssigned = await db
        .select({ botId: taskSessionBotsTable.botId })
        .from(taskSessionBotsTable)
        .where(eq(taskSessionBotsTable.sessionId, session.id));
      const assignedSet = new Set(alreadyAssigned.map((r) => r.botId));
      const newBotIds = [...new Set(body.data.botIds)].filter((id) => !assignedSet.has(id));

      if (newBotIds.length > 0) {
        await db.insert(taskSessionBotsTable).values(
          newBotIds.map((botId) => ({
            sessionId: session.id,
            botId,
          })),
        );
      }
    }

    const result = await getSessionWithBots(session.id);
    res.json(result);
  },
);

export default router;
