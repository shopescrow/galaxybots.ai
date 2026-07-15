import { Router, type IRouter } from "express";
import { db, taskSessionsTable, taskSessionMessagesTable, taskSessionBotsTable, botsTable, roomParticipantsTable } from "@workspace/db";
import { eq, and, gt, desc, sql, inArray } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import { broadcastSSE } from "../../services/platform/sse";
import { getTeamBotsForSession, verifyGuestAccess } from "../../services/missions/session-queries";
import { runAgenticLoop } from "../../tools";
import { buildClientContext } from "../../services/clients/client-context";
import { buildMemoryContext } from "../../services/bots/memory";
import { applyBrandVoiceGuardrails } from "../../services/platform/governance";
import { z } from "zod/v4";

const router: IRouter = Router();

const PRESENCE_WINDOW_SECONDS = 60;

function activeParticipantsCondition(sessionId: number) {
  return and(
    eq(roomParticipantsTable.taskSessionId, sessionId),
    gt(roomParticipantsTable.lastSeenAt, sql`NOW() - INTERVAL '${sql.raw(String(PRESENCE_WINDOW_SECONDS))} seconds'`),
  );
}

async function resolveSession(sessionId: number, clientId: number) {
  const [session] = await db
    .select()
    .from(taskSessionsTable)
    .where(and(eq(taskSessionsTable.id, sessionId), eq(taskSessionsTable.clientId, clientId)));
  return session ?? null;
}

router.post("/task-sessions/:id/join", async (req, res): Promise<void> => {
  const sessionId = Number(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const clientId = req.user!.clientId;
  const userId = req.user!.userId ?? null;

  const session = await resolveSession(sessionId, clientId);
  if (!session) {
    res.status(404).json({ error: "Task session not found" });
    return;
  }

  if (!(await verifyGuestAccess(req, sessionId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const displayName = (req.body.displayName as string | undefined) || req.user!.email || "Team Member";
  const role = req.body.role === "participant" ? "participant" : "observer";

  const existing = userId
    ? await db
        .select()
        .from(roomParticipantsTable)
        .where(and(eq(roomParticipantsTable.taskSessionId, sessionId), eq(roomParticipantsTable.userId, userId)))
    : [];

  let participant;
  if (existing.length > 0) {
    [participant] = await db
      .update(roomParticipantsTable)
      .set({ lastSeenAt: new Date(), role, displayName })
      .where(eq(roomParticipantsTable.id, existing[0].id))
      .returning();
  } else {
    [participant] = await db
      .insert(roomParticipantsTable)
      .values({ taskSessionId: sessionId, userId, clientId, displayName, role })
      .returning();
  }

  broadcastSSE("room:joined", {
    clientId,
    sessionId,
    participant: {
      id: participant.id,
      displayName: participant.displayName,
      role: participant.role,
      joinedAt: participant.joinedAt,
    },
  });

  const participants = await db
    .select()
    .from(roomParticipantsTable)
    .where(activeParticipantsCondition(sessionId))
    .orderBy(roomParticipantsTable.joinedAt);

  res.json({ participant, participants });
});

router.delete("/task-sessions/:id/leave", async (req, res): Promise<void> => {
  const sessionId = Number(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const clientId = req.user!.clientId;
  const userId = req.user!.userId ?? null;

  const session = await resolveSession(sessionId, clientId);
  if (!session) {
    res.status(404).json({ error: "Task session not found" });
    return;
  }

  if (!(await verifyGuestAccess(req, sessionId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!userId) {
    res.status(200).json({ ok: true });
    return;
  }

  const [deleted] = await db
    .delete(roomParticipantsTable)
    .where(and(eq(roomParticipantsTable.taskSessionId, sessionId), eq(roomParticipantsTable.userId, userId)))
    .returning();

  if (deleted) {
    broadcastSSE("room:left", {
      clientId,
      sessionId,
      participantId: deleted.id,
    });
  }

  res.json({ ok: true });
});

router.get("/task-sessions/:id/participants", async (req, res): Promise<void> => {
  const sessionId = Number(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const clientId = req.user!.clientId;

  const session = await resolveSession(sessionId, clientId);
  if (!session) {
    res.status(404).json({ error: "Task session not found" });
    return;
  }

  if (!(await verifyGuestAccess(req, sessionId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const participants = await db
    .select()
    .from(roomParticipantsTable)
    .where(activeParticipantsCondition(sessionId))
    .orderBy(roomParticipantsTable.joinedAt);

  res.json(participants);
});

router.post("/task-sessions/:id/heartbeat", async (req, res): Promise<void> => {
  const sessionId = Number(req.params.id);
  const userId = req.user!.userId ?? null;
  const clientId = req.user!.clientId;

  if (!sessionId || !userId) {
    res.json({ ok: true });
    return;
  }

  const session = await resolveSession(sessionId, clientId);
  if (!session) {
    res.json({ ok: true });
    return;
  }

  if (!(await verifyGuestAccess(req, sessionId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  await db
    .update(roomParticipantsTable)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(roomParticipantsTable.taskSessionId, sessionId), eq(roomParticipantsTable.userId, userId)));

  res.json({ ok: true });
});

const HumanMessageBody = z.object({
  content: z.string().min(1).max(4000),
});

router.post("/task-sessions/:id/human-message", async (req, res): Promise<void> => {
  const sessionId = Number(req.params.id);
  if (!sessionId) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const body = HumanMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.issues });
    return;
  }

  const clientId = req.user!.clientId;
  const userId = req.user!.userId ?? null;

  const session = await resolveSession(sessionId, clientId);
  if (!session) {
    res.status(404).json({ error: "Task session not found" });
    return;
  }

  if (!(await verifyGuestAccess(req, sessionId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (session.status !== "active") {
    res.status(409).json({ error: "Session is not active" });
    return;
  }

  const participantRows = userId
    ? await db
        .select({ role: roomParticipantsTable.role, displayName: roomParticipantsTable.displayName })
        .from(roomParticipantsTable)
        .where(and(eq(roomParticipantsTable.taskSessionId, sessionId), eq(roomParticipantsTable.userId, userId)))
    : [];

  if (participantRows.length === 0 || participantRows[0].role !== "participant") {
    res.status(403).json({ error: "Only participants can send messages" });
    return;
  }

  const displayName = participantRows[0].displayName ?? "Human";

  const [humanMsg] = await db
    .insert(taskSessionMessagesTable)
    .values({
      sessionId,
      role: "user",
      content: body.data.content,
      botName: displayName,
      botTitle: "Live Room Participant",
      messageType: "text",
      senderRole: "human",
    })
    .returning();

  broadcastSSE("room:human_message", {
    clientId,
    sessionId,
    message: {
      id: humanMsg.id,
      content: humanMsg.content,
      senderName: displayName,
      createdAt: humanMsg.createdAt,
    },
  });

  const teamBots = await getTeamBotsForSession(sessionId);
  const clientContext = await buildClientContext(clientId);
  const teamRoster = teamBots.map((b) => `${b.name} (${b.title})`).join(", ");

  const recentMsgs = await db
    .select()
    .from(taskSessionMessagesTable)
    .where(eq(taskSessionMessagesTable.sessionId, sessionId))
    .orderBy(desc(taskSessionMessagesTable.createdAt))
    .limit(8);
  const contextMessages = recentMsgs
    .slice()
    .reverse()
    .map((m) => `${m.botName || "User"}: ${m.content}`)
    .join("\n");

  const leadBot = teamBots[0];
  if (leadBot) {
    try {
      let memoryContext = "";
      try {
        memoryContext = await buildMemoryContext(leadBot.id, body.data.content, clientId);
      } catch { /* non-fatal */ }

      const systemPrompt = `You are ${leadBot.name}, ${leadBot.title} in the ${leadBot.department} department.
Personality: ${leadBot.personality}
${clientContext}
TASK OBJECTIVE: ${session.objective}
TEAM MEMBERS: ${teamRoster}
${memoryContext}
A human team member has sent a live message into this session. Respond helpfully and concisely (2-4 sentences).`;

      const { finalContent } = await runAgenticLoop({
        model: "gpt-5.4",
        maxIterations: 5,
        maxTokens: 400,
        systemPrompt,
        messages: [
          {
            role: "user",
            content: `Recent discussion:\n${contextMessages}\n\nHuman message from ${displayName}: ${body.data.content}`,
          },
        ],
        context: {
          sessionId,
          botId: leadBot.id,
          botName: leadBot.name,
          clientId,
          userId: req.user!.userId,
          isGuest: req.user!.role === "guest",
          depth: 0,
        },
      });

      let cleanContent = (finalContent || "Acknowledged.").replace(/\[NEED_ROLE:\s*.+?\]/g, "").trim();
      if (clientId) {
        cleanContent = await applyBrandVoiceGuardrails(clientId, cleanContent);
      }

      const [botReply] = await db
        .insert(taskSessionMessagesTable)
        .values({
          sessionId,
          botId: leadBot.id,
          botName: leadBot.name,
          botTitle: leadBot.title,
          role: "bot",
          content: cleanContent,
          messageType: "text",
          senderRole: "agent",
        })
        .returning();

      broadcastSSE("room:agent_reply", {
        clientId,
        sessionId,
        message: {
          id: botReply.id,
          content: botReply.content,
          botName: leadBot.name,
          botTitle: leadBot.title,
          createdAt: botReply.createdAt,
        },
      });

      res.status(201).json({ humanMessage: humanMsg, agentReply: botReply });
      return;
    } catch (err) {
      console.error("[live-rooms] Agent reply error:", err instanceof Error ? err.message : err);
    }
  }

  res.status(201).json({ humanMessage: humanMsg, agentReply: null });
});

router.get("/task-sessions/active", requireRole("owner", "admin", "csuite"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const activeSessions = await db
    .select()
    .from(taskSessionsTable)
    .where(and(eq(taskSessionsTable.clientId, clientId), eq(taskSessionsTable.status, "active")))
    .orderBy(desc(taskSessionsTable.createdAt));

  if (activeSessions.length === 0) {
    res.json([]);
    return;
  }

  const sessionIds = activeSessions.map((s) => s.id);

  const allSessionBots = await db
    .select({ sessionId: taskSessionBotsTable.sessionId, botName: botsTable.name, botTitle: botsTable.title })
    .from(taskSessionBotsTable)
    .innerJoin(botsTable, eq(taskSessionBotsTable.botId, botsTable.id))
    .where(inArray(taskSessionBotsTable.sessionId, sessionIds));

  const allParticipants = await db
    .select({ sessionId: roomParticipantsTable.taskSessionId, count: sql<number>`COUNT(*)` })
    .from(roomParticipantsTable)
    .where(
      and(
        inArray(roomParticipantsTable.taskSessionId, sessionIds),
        gt(roomParticipantsTable.lastSeenAt, sql`NOW() - INTERVAL '60 seconds'`),
      ),
    )
    .groupBy(roomParticipantsTable.taskSessionId);

  const recentMsgsPerSession = await Promise.all(
    sessionIds.map((sid) =>
      db
        .select()
        .from(taskSessionMessagesTable)
        .where(and(eq(taskSessionMessagesTable.sessionId, sid), eq(taskSessionMessagesTable.messageType, "text")))
        .orderBy(desc(taskSessionMessagesTable.createdAt))
        .limit(3),
    ),
  );

  const now = Date.now();
  const result = activeSessions.map((session, idx) => {
    const bots = allSessionBots.filter((b) => b.sessionId === session.id);
    const msgs = (recentMsgsPerSession[idx] ?? []).slice().reverse();
    const presenceRow = allParticipants.find((p) => p.sessionId === session.id);
    const participantCount = presenceRow ? Number(presenceRow.count) : 0;
    const elapsedMs = now - new Date(session.createdAt).getTime();
    const elapsedMinutes = Math.floor(elapsedMs / 60000);

    return {
      ...session,
      bots,
      recentMessages: msgs.map((m) => ({
        id: m.id,
        content: m.content,
        botName: m.botName,
        senderRole: m.senderRole,
        createdAt: m.createdAt,
      })),
      participantCount,
      elapsedMinutes,
    };
  });

  res.json(result);
});

export default router;
