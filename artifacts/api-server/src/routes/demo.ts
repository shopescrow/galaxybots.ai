import { Router, type IRouter } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { EventEmitter } from "events";
import {
  db,
  guestSessionsTable,
  clientsTable,
  usersTable,
  botsTable,
  taskSessionsTable,
  taskSessionBotsTable,
  taskSessionMessagesTable,
  knowledgeBaseDocumentsTable,
  knowledgeBaseChunksTable,
} from "@workspace/db";
import { eq, and, gt, sql, gte, lte, desc, inArray } from "drizzle-orm";
import { signToken } from "../middleware/auth";
import rateLimit from "express-rate-limit";
import { runAgenticLoop } from "../tools/agentic-loop";
import { buildClientContext } from "../services/client-context";

const router: IRouter = Router();

const missionEmitters = new Map<number, EventEmitter>();

function getMissionEmitter(taskSessionId: number): EventEmitter {
  let emitter = missionEmitters.get(taskSessionId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    missionEmitters.set(taskSessionId, emitter);
  }
  return emitter;
}

function cleanupMissionEmitter(taskSessionId: number): void {
  const emitter = missionEmitters.get(taskSessionId);
  if (emitter) {
    emitter.removeAllListeners();
    missionEmitters.delete(taskSessionId);
  }
}

const DEMO_COMPANY_NAME = "Apex Ventures";
const DEMO_CONTACT_NAME = "Demo User";
const DEMO_CONTACT_EMAIL = "demo@apexventures.example";
const DEMO_SESSION_DURATION_MS = 30 * 60 * 1000;
const DEMO_JWT_EXPIRY = "30m";
const DEMO_CLEANUP_THRESHOLD_MS = 2 * 60 * 60 * 1000;

const DEMO_MISSION_OBJECTIVE = "Analyze our Q2 marketing performance and recommend a growth strategy for next quarter";

const DEMO_BOT_ROLES = [
  { keywords: ["marketing", "cmo", "maya"], department: "marketing" },
  { keywords: ["finance", "cfo", "vance", "frank"], department: "finance" },
  { keywords: ["growth", "kira"], department: "growth" },
];

const DEMO_INDUSTRY = "Technology / SaaS";
const DEMO_SERVICES = ["AI-Powered Analytics", "Marketing Automation", "Customer Intelligence Platform"];
const DEMO_BUSINESS_CONTEXT = "Apex Ventures is a mid-market SaaS company with $12M ARR, 200 enterprise customers, and a 15-person marketing team. Q2 saw a 8% decline in MQL-to-SQL conversion rate and a 12% increase in CAC. The board is pushing for aggressive growth in Q3 while maintaining profitability.";

const SANDBOXED_TOOLS = new Set([
  "send_email",
  "post_slack_message",
  "create_document",
  "create_calendar_event",
  "crm_upsert_contact",
  "crm_create_deal",
  "create_issue",
  "update_issue",
  "create_studio_document",
]);

const READ_ONLY_TOOLS = new Set([
  "web_search",
  "read_world_state",
  "read_platform_data",
  "read_email",
  "read_slack_channel",
  "read_document",
  "list_calendar_events",
  "scrape_webpage",
  "analyze_aeo_score",
  "aeo_recommend",
  "delegate_to_bot",
  "prospect_search",
  "get_prospects",
  "browse_sabrina_automations",
]);

export function isToolSandboxed(toolName: string): boolean {
  return !GUEST_ALLOWED_TOOLS.has(toolName);
}

const GUEST_ALLOWED_TOOLS = new Set([
  ...READ_ONLY_TOOLS,
]);

export function getSandboxedToolResponse(toolName: string): unknown {
  const mockResponses: Record<string, unknown> = {
    send_email: { success: true, messageId: "demo-mock-001", note: "[SANDBOXED] Email would be sent in a live account." },
    post_slack_message: { success: true, ts: "demo-mock-ts", note: "[SANDBOXED] Slack message would be posted in a live account." },
    create_document: { success: true, id: "demo-doc-001", url: "https://notion.so/demo", note: "[SANDBOXED] Document would be created in a live account." },
    create_calendar_event: { success: true, id: "demo-event-001", note: "[SANDBOXED] Calendar event would be created in a live account." },
    crm_upsert_contact: { success: true, contactId: "demo-contact-001", note: "[SANDBOXED] CRM contact would be upserted in a live account." },
    crm_create_deal: { success: true, dealId: "demo-deal-001", note: "[SANDBOXED] CRM deal would be created in a live account." },
    create_issue: { success: true, issueId: "demo-issue-001", url: "https://linear.app/demo", note: "[SANDBOXED] Issue would be created in a live account." },
    update_issue: { success: true, note: "[SANDBOXED] Issue would be updated in a live account." },
    create_studio_document: { success: true, documentId: 0, note: "[SANDBOXED] Studio document would be created in a live account." },
  };
  return mockResponses[toolName] || { success: true, note: `[SANDBOXED] ${toolName} would execute in a live account.` };
}

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip + (process.env.JWT_SECRET || "salt")).digest("hex").slice(0, 32);
}

async function autoLaunchDemoMission(
  taskSessionId: number,
  clientId: number,
  botIds: number[]
): Promise<void> {
  const emitter = getMissionEmitter(taskSessionId);
  try {
    const bots = botIds.length > 0
      ? await db.select().from(botsTable).where(inArray(botsTable.id, botIds))
      : [];
    if (bots.length === 0) {
      emitter.emit("event", { type: "done" });
      cleanupMissionEmitter(taskSessionId);
      return;
    }

    await db.insert(taskSessionMessagesTable).values({
      sessionId: taskSessionId,
      role: "user",
      content: DEMO_MISSION_OBJECTIVE,
      botName: "Mission Control",
      botTitle: "System",
      messageType: "text",
    });
    emitter.emit("event", { type: "message", role: "user", content: DEMO_MISSION_OBJECTIVE, botName: "Mission Control" });

    const clientContext = await buildClientContext(clientId);
    const teamRoster = bots.map((b) => `${b.name} (${b.title})`).join(", ");

    for (const bot of bots) {
      emitter.emit("event", { type: "bot_start", botName: bot.name, botTitle: bot.title });

      const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department — a master's-level domain expert.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}
${clientContext}
TASK OBJECTIVE: ${DEMO_MISSION_OBJECTIVE}
TEAM MEMBERS: ${teamRoster}
${DEMO_BUSINESS_CONTEXT}
You are participating in a live demo session for a prospective customer. Deliver an impressive, substantive initial assessment demonstrating deep domain expertise. Be specific with metrics, frameworks, and actionable recommendations. Keep response focused and impactful (4-6 sentences).`;

      const { finalContent, events } = await runAgenticLoop({
        model: "gpt-4o-mini",
        maxIterations: 5,
        maxTokens: 400,
        systemPrompt,
        messages: [
          {
            role: "user",
            content: `Mission briefing: ${DEMO_MISSION_OBJECTIVE}\n\nProvide your initial expert assessment of this situation. What are the key issues you see, and what should we focus on first?`,
          },
        ],
        context: {
          sessionId: taskSessionId,
          botId: bot.id,
          botName: bot.name,
          clientId,
          userId: 0,
          isGuest: true,
        },
      });

      for (const event of events) {
        if (event.type === "tool_call") {
          const msg = {
            sessionId: taskSessionId,
            botId: bot.id,
            botName: bot.name,
            botTitle: bot.title,
            role: "bot" as const,
            content: `Using tool: ${event.toolName}`,
            messageType: "tool_call",
            toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input },
          };
          await db.insert(taskSessionMessagesTable).values(msg);
          emitter.emit("event", { type: "tool_call", ...msg });
        } else if (event.type === "tool_result") {
          const msg = {
            sessionId: taskSessionId,
            botId: bot.id,
            botName: bot.name,
            botTitle: bot.title,
            role: "bot" as const,
            content: `Tool result: ${event.toolName}`,
            messageType: "tool_result",
            toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, output: event.output },
          };
          await db.insert(taskSessionMessagesTable).values(msg);
          emitter.emit("event", { type: "tool_result", ...msg });
        }
      }

      const content = finalContent || "Acknowledged. I will analyze this and provide my assessment shortly.";
      await db.insert(taskSessionMessagesTable).values({
        sessionId: taskSessionId,
        botId: bot.id,
        botName: bot.name,
        botTitle: bot.title,
        role: "bot",
        content,
        messageType: "text",
      });
      emitter.emit("event", { type: "message", role: "bot", content, botName: bot.name, botTitle: bot.title, botId: bot.id });
    }

    emitter.emit("event", { type: "done" });
  } catch (err) {
    console.error("[Demo] Auto-launch mission error:", err);
    emitter.emit("event", { type: "error", content: "Mission auto-launch encountered an error" });
  } finally {
    setTimeout(() => cleanupMissionEmitter(taskSessionId), 5000);
  }
}

const demoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 1,
  keyGenerator: (req) => req.ip || "unknown",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  message: { error: "Demo sessions are limited to 1 per hour. Please try again later or create an account." },
});

async function seedDemoCompany(): Promise<{ clientId: number; botIds: number[] }> {
  const [client] = await db
    .insert(clientsTable)
    .values({
      companyName: DEMO_COMPANY_NAME,
      contactName: DEMO_CONTACT_NAME,
      contactEmail: `demo-${Date.now()}@apexventures.example`,
      plan: "team",
      status: "demo",
      industry: DEMO_INDUSTRY,
      servicesList: DEMO_SERVICES,
      targetMarket: "Mid-market and Enterprise B2B SaaS companies",
      businessContext: DEMO_BUSINESS_CONTEXT,
    })
    .returning();

  const allBots = await db.select().from(botsTable);
  const selectedBotIds: number[] = [];

  for (const role of DEMO_BOT_ROLES) {
    const match = allBots.find(
      (b) =>
        role.keywords.some((kw) =>
          b.name.toLowerCase().includes(kw) ||
          b.title.toLowerCase().includes(kw) ||
          b.department.toLowerCase().includes(kw)
        ) && !selectedBotIds.includes(b.id)
    );
    if (match) selectedBotIds.push(match.id);
  }

  if (selectedBotIds.length === 0 && allBots.length > 0) {
    selectedBotIds.push(...allBots.slice(0, 3).map((b) => b.id));
  }

  const botIds = selectedBotIds;

  const [kbDoc] = await db
    .insert(knowledgeBaseDocumentsTable)
    .values({
      clientId: client.id,
      title: "Apex Ventures Q2 Performance Brief",
      sourceFilename: "apex-q2-brief.txt",
      fileType: "text/plain",
      chunkCount: 1,
    })
    .returning();

  await db.insert(knowledgeBaseChunksTable).values({
    documentId: kbDoc.id,
    clientId: client.id,
    chunkText: `APEX VENTURES — Q2 PERFORMANCE BRIEF

Company: Apex Ventures (SaaS, $12M ARR)
Customers: 200 enterprise accounts
Marketing Team: 15 people
Q2 Key Metrics:
- MQL-to-SQL conversion rate declined 8% QoQ
- Customer acquisition cost (CAC) increased 12%
- Churn rate: 4.2% (up from 3.8%)
- NPS: 42 (stable)
- Pipeline velocity: 45 days avg (up from 38)

Channel Performance:
- Paid search: $2.1M spend, 3.2x ROAS (down from 4.1x)
- Content marketing: 15K organic visits/mo (flat)
- Outbound: 180 SQLs generated (down 15%)
- Events/webinars: 22 events, 1.2K registrations

Board Priorities for Q3:
1. Restore MQL-to-SQL conversion to Q1 levels
2. Reduce CAC by 20% while maintaining growth rate
3. Launch ABM pilot targeting top 50 enterprise prospects
4. Expand into healthcare vertical (new TAM: $800M)`,
    chunkIndex: 0,
  });

  return { clientId: client.id, botIds };
}

async function cleanupExpiredSessions(): Promise<void> {
  const deletionThreshold = new Date(Date.now() - DEMO_CLEANUP_THRESHOLD_MS);

  await db
    .update(guestSessionsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(guestSessionsTable.status, "active"),
        lte(guestSessionsTable.expiresAt, new Date())
      )
    );

  const expired = await db
    .select({ id: guestSessionsTable.id, clientId: guestSessionsTable.clientId })
    .from(guestSessionsTable)
    .where(
      and(
        eq(guestSessionsTable.status, "expired"),
        lte(guestSessionsTable.expiresAt, deletionThreshold)
      )
    );

  for (const session of expired) {
    if (session.clientId) {
      const taskSessions = await db
        .select({ id: taskSessionsTable.id })
        .from(taskSessionsTable)
        .where(eq(taskSessionsTable.clientId, session.clientId));

      for (const ts of taskSessions) {
        await db.delete(taskSessionMessagesTable).where(eq(taskSessionMessagesTable.sessionId, ts.id));
        await db.delete(taskSessionBotsTable).where(eq(taskSessionBotsTable.sessionId, ts.id));
      }
      await db.delete(taskSessionsTable).where(eq(taskSessionsTable.clientId, session.clientId));
      await db.delete(clientsTable).where(eq(clientsTable.id, session.clientId));
    }

    await db
      .update(guestSessionsTable)
      .set({ status: "cleaned", clientId: null, taskSessionId: null })
      .where(eq(guestSessionsTable.id, session.id));
  }
}

setInterval(() => {
  cleanupExpiredSessions().catch((err) => console.error("[Demo] Scheduled cleanup error:", err));
}, 15 * 60 * 1000);

router.post("/demo/start", demoRateLimit, async (req, res): Promise<void> => {
  try {
    cleanupExpiredSessions().catch((err) => console.error("Demo cleanup error:", err));

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ipHash = hashIp(ip);

    const recentSession = await db
      .select()
      .from(guestSessionsTable)
      .where(
        and(
          eq(guestSessionsTable.ipHash, ipHash),
          eq(guestSessionsTable.status, "active"),
          gt(guestSessionsTable.expiresAt, new Date())
        )
      )
      .limit(1);

    if (recentSession.length > 0) {
      const existing = recentSession[0]!;
      const secret = process.env["JWT_SECRET"];
      if (!secret) {
        res.status(500).json({ error: "Server configuration error" });
        return;
      }

      const guestToken = jwt.sign(
        {
          userId: 0,
          clientId: existing.clientId,
          role: "guest",
          email: "demo@apexventures.example",
          guestSessionId: existing.id,
        },
        secret,
        { expiresIn: DEMO_JWT_EXPIRY }
      );

      res.json({
        token: guestToken,
        sessionToken: existing.sessionToken,
        clientId: existing.clientId,
        taskSessionId: existing.taskSessionId,
        expiresAt: existing.expiresAt,
        company: {
          name: DEMO_COMPANY_NAME,
          industry: DEMO_INDUSTRY,
          context: DEMO_BUSINESS_CONTEXT,
        },
        mission: DEMO_MISSION_OBJECTIVE,
        isExisting: true,
      });
      return;
    }

    const { clientId, botIds } = await seedDemoCompany();

    const [taskSession] = await db
      .insert(taskSessionsTable)
      .values({
        objective: DEMO_MISSION_OBJECTIVE,
        clientId,
        status: "active",
      })
      .returning();

    if (botIds.length > 0) {
      await db.insert(taskSessionBotsTable).values(
        botIds.map((botId) => ({
          sessionId: taskSession.id,
          botId,
        }))
      );
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + DEMO_SESSION_DURATION_MS);

    const [guestSession] = await db
      .insert(guestSessionsTable)
      .values({
        sessionToken,
        ipHash,
        clientId,
        taskSessionId: taskSession.id,
        status: "active",
        expiresAt,
      })
      .returning();

    const secret = process.env["JWT_SECRET"];
    if (!secret) {
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    const guestToken = jwt.sign(
      {
        userId: 0,
        clientId,
        role: "guest",
        email: "demo@apexventures.example",
        guestSessionId: guestSession.id,
      },
      secret,
      { expiresIn: DEMO_JWT_EXPIRY }
    );

    const bots = botIds.length > 0
      ? await db.select().from(botsTable).where(sql`${botsTable.id} = ANY(${botIds})`)
      : [];

    autoLaunchDemoMission(taskSession.id, clientId, botIds).catch((err) =>
      console.error("[Demo] Background auto-launch error:", err)
    );

    res.status(201).json({
      token: guestToken,
      sessionToken,
      clientId,
      taskSessionId: taskSession.id,
      expiresAt,
      company: {
        name: DEMO_COMPANY_NAME,
        industry: DEMO_INDUSTRY,
        context: DEMO_BUSINESS_CONTEXT,
      },
      mission: DEMO_MISSION_OBJECTIVE,
      team: bots.map((b) => ({
        id: b.id,
        name: b.name,
        title: b.title,
        department: b.department,
      })),
      isExisting: false,
    });
  } catch (err) {
    console.error("Demo start error:", err);
    res.status(500).json({ error: "Failed to start demo session" });
  }
});

router.get("/demo/mission-stream", async (req, res): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No demo session" });
      return;
    }

    const token = authHeader.slice(7);
    const secret = process.env["JWT_SECRET"];
    if (!secret) {
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    let decoded: { guestSessionId?: number; role?: string; clientId?: number };
    try {
      decoded = jwt.verify(token, secret) as typeof decoded;
    } catch {
      res.status(401).json({ error: "Invalid or expired demo session" });
      return;
    }

    if (decoded.role !== "guest" || !decoded.guestSessionId) {
      res.status(403).json({ error: "Not a guest session" });
      return;
    }

    const [guestSession] = await db
      .select()
      .from(guestSessionsTable)
      .where(eq(guestSessionsTable.id, decoded.guestSessionId));

    if (!guestSession || !guestSession.taskSessionId) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendSSE = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const emitter = getMissionEmitter(guestSession.taskSessionId);
    const onEvent = (event: Record<string, unknown>) => {
      sendSSE(event);
      if (event.type === "done" || event.type === "error") {
        res.end();
      }
    };

    emitter.on("event", onEvent);

    req.on("close", () => {
      emitter.off("event", onEvent);
    });

    const existingMessages = await db
      .select()
      .from(taskSessionMessagesTable)
      .where(eq(taskSessionMessagesTable.sessionId, guestSession.taskSessionId));

    if (existingMessages.length > 1) {
      for (const msg of existingMessages) {
        sendSSE({
          type: "message",
          role: msg.role,
          content: msg.content,
          botName: msg.botName,
          botTitle: msg.botTitle,
          botId: msg.botId,
          messageType: msg.messageType,
        });
      }

      if (!missionEmitters.has(guestSession.taskSessionId)) {
        sendSSE({ type: "done" });
        res.end();
        return;
      }
    }
  } catch (err) {
    console.error("Demo mission stream error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Stream error" });
    }
  }
});

router.get("/demo/status", async (req, res): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No demo session" });
      return;
    }

    const token = authHeader.slice(7);
    const secret = process.env["JWT_SECRET"];
    if (!secret) {
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    let decoded: { guestSessionId?: number; role?: string };
    try {
      decoded = jwt.verify(token, secret) as typeof decoded;
    } catch {
      res.status(401).json({ error: "Invalid or expired demo session" });
      return;
    }

    if (decoded.role !== "guest" || !decoded.guestSessionId) {
      res.status(400).json({ error: "Not a demo session" });
      return;
    }

    const [session] = await db
      .select()
      .from(guestSessionsTable)
      .where(eq(guestSessionsTable.id, decoded.guestSessionId));

    if (!session) {
      res.status(404).json({ error: "Demo session not found" });
      return;
    }

    const remainingMs = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());

    res.json({
      status: session.status,
      expiresAt: session.expiresAt,
      remainingMs,
      missionCompleted: session.missionCompleted,
      taskSessionId: session.taskSessionId,
      clientId: session.clientId,
    });
  } catch (err) {
    console.error("Demo status error:", err);
    res.status(500).json({ error: "Failed to get demo status" });
  }
});

router.post("/demo/complete", async (req, res): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No demo session" });
      return;
    }

    const token = authHeader.slice(7);
    const secret = process.env["JWT_SECRET"];
    if (!secret) {
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    let decoded: { guestSessionId?: number; role?: string; clientId?: number };
    try {
      decoded = jwt.verify(token, secret) as typeof decoded;
    } catch {
      res.status(401).json({ error: "Invalid or expired demo session" });
      return;
    }

    if (decoded.role !== "guest" || !decoded.guestSessionId) {
      res.status(400).json({ error: "Not a demo session" });
      return;
    }

    const [session] = await db
      .select()
      .from(guestSessionsTable)
      .where(eq(guestSessionsTable.id, decoded.guestSessionId));

    if (!session || !session.taskSessionId) {
      res.status(404).json({ error: "Demo session not found" });
      return;
    }

    if (session.status !== "active" || new Date(session.expiresAt) < new Date()) {
      res.status(410).json({ error: "Demo session has expired" });
      return;
    }

    const msgCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(taskSessionMessagesTable)
      .where(eq(taskSessionMessagesTable.sessionId, session.taskSessionId));

    const messageCount = Number(msgCount[0]?.count || 0);
    const estimatedHoursSaved = Math.max(2, Math.round(messageCount * 0.5));
    const hourlyRate = 150;
    const estimatedCostSavings = estimatedHoursSaved * hourlyRate;

    const roiData = JSON.stringify({
      messageCount,
      estimatedHoursSaved,
      estimatedCostSavings,
      hourlyRate,
      missionObjective: DEMO_MISSION_OBJECTIVE,
      completedAt: new Date().toISOString(),
    });

    await db
      .update(guestSessionsTable)
      .set({ missionCompleted: true, roiData })
      .where(eq(guestSessionsTable.id, session.id));

    res.json({
      estimatedHoursSaved,
      estimatedCostSavings,
      hourlyRate,
      messageCount,
      missionObjective: DEMO_MISSION_OBJECTIVE,
    });
  } catch (err) {
    console.error("Demo complete error:", err);
    res.status(500).json({ error: "Failed to complete demo" });
  }
});

router.post("/demo/claim", async (req, res): Promise<void> => {
  try {
    const { sessionToken, email, password, companyName, contactName, displayName } = req.body;

    if (!sessionToken || !email || !password || !companyName || !contactName) {
      res.status(400).json({ error: "sessionToken, email, password, companyName, and contactName are required" });
      return;
    }

    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const [guestSession] = await db
      .select()
      .from(guestSessionsTable)
      .where(eq(guestSessionsTable.sessionToken, sessionToken));

    if (!guestSession) {
      res.status(404).json({ error: "Demo session not found" });
      return;
    }

    if (guestSession.status === "claimed") {
      res.status(409).json({ error: "This demo session has already been claimed" });
      return;
    }

    if (guestSession.status !== "active" || new Date(guestSession.expiresAt) < new Date()) {
      res.status(410).json({ error: "This demo session has expired. Please start a new demo." });
      return;
    }

    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()));

    if (existingUser) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const [newClient] = await db
      .insert(clientsTable)
      .values({
        companyName,
        contactName,
        contactEmail: email.toLowerCase(),
        plan: "trial",
        status: "trial",
      })
      .returning();

    const passwordHash = await bcrypt.hash(password, 12);
    const [newUser] = await db
      .insert(usersTable)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        clientId: newClient.id,
        role: "owner",
        displayName: displayName || contactName,
      })
      .returning();

    if (guestSession.taskSessionId && guestSession.clientId) {
      await db
        .update(taskSessionsTable)
        .set({ clientId: newClient.id })
        .where(
          and(
            eq(taskSessionsTable.id, guestSession.taskSessionId),
            eq(taskSessionsTable.clientId, guestSession.clientId)
          )
        );
    }

    await db
      .update(guestSessionsTable)
      .set({ status: "claimed", claimedByUserId: newUser.id })
      .where(eq(guestSessionsTable.id, guestSession.id));

    if (guestSession.clientId) {
      await db.delete(clientsTable).where(eq(clientsTable.id, guestSession.clientId)).catch(() => {});
    }

    const authToken = signToken({
      userId: newUser.id,
      clientId: newClient.id,
      role: newUser.role,
      email: newUser.email,
      plan: newClient.plan,
      bypassPayment: newUser.bypassPayment,
    });

    res.cookie("token", authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: {
        id: newUser.id,
        email: newUser.email,
        clientId: newClient.id,
        role: newUser.role,
        displayName: newUser.displayName,
      },
      token: authToken,
      migratedTaskSessionId: guestSession.taskSessionId,
    });
  } catch (err) {
    console.error("Demo claim error:", err);
    res.status(500).json({ error: "Failed to claim demo session" });
  }
});

router.get("/analytics/demo-metrics", async (req, res): Promise<void> => {
  if (!req.user || (req.user.role !== "owner" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  try {
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

    const conditions: ReturnType<typeof eq>[] = [];
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) conditions.push(gte(guestSessionsTable.createdAt, d));
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) conditions.push(lte(guestSessionsTable.createdAt, d));
    }

    const allSessions = await db
      .select({
        status: guestSessionsTable.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(guestSessionsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(guestSessionsTable.status);

    const completedCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(guestSessionsTable)
      .where(
        and(
          eq(guestSessionsTable.missionCompleted, true),
          ...(conditions.length > 0 ? conditions : [])
        )
      );

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const row of allSessions) {
      statusMap[row.status] = Number(row.count);
      total += Number(row.count);
    }

    const starts = total;
    const completions = Number(completedCount[0]?.count || 0);
    const claims = statusMap["claimed"] || 0;

    const avgMsgResult = await db
      .select({ avg: sql<number>`COALESCE(AVG(msg_count), 0)` })
      .from(
        db
          .select({
            sessionId: guestSessionsTable.taskSessionId,
            msg_count: sql<number>`(SELECT COUNT(*) FROM task_session_messages WHERE session_id = ${guestSessionsTable.taskSessionId})`,
          })
          .from(guestSessionsTable)
          .where(sql`${guestSessionsTable.taskSessionId} IS NOT NULL`)
          .as("sub")
      );
    const avgMessagesPerSession = Number(avgMsgResult[0]?.avg || 0);

    const last24hThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24hSessions = await db
      .select({
        status: guestSessionsTable.status,
        missionCompleted: guestSessionsTable.missionCompleted,
        count: sql<number>`COUNT(*)`,
      })
      .from(guestSessionsTable)
      .where(gte(guestSessionsTable.createdAt, last24hThreshold))
      .groupBy(guestSessionsTable.status, guestSessionsTable.missionCompleted);

    let last24hStarts = 0;
    let last24hCompleted = 0;
    let last24hClaimed = 0;
    for (const row of last24hSessions) {
      const c = Number(row.count);
      last24hStarts += c;
      if (row.missionCompleted) last24hCompleted += c;
      if (row.status === "claimed") last24hClaimed += c;
    }

    res.json({
      totalDemoStarts: starts,
      totalCompleted: completions,
      totalClaimed: claims,
      conversionRate: starts > 0 ? (claims / starts) * 100 : 0,
      avgMessagesPerSession,
      last24h: {
        starts: last24hStarts,
        completed: last24hCompleted,
        claimed: last24hClaimed,
      },
      byStatus: statusMap,
    });
  } catch (err) {
    console.error("Demo metrics error:", err);
    res.status(500).json({ error: "Failed to fetch demo metrics" });
  }
});

export default router;
