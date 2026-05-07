import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  db,
  clientStakeholdersTable,
  clientsTable,
  pendingApprovalsTable,
  taskSessionsTable,
  taskSessionBotsTable,
  taskSessionMessagesTable,
  sessionOutcomesTable,
  botsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, or } from "drizzle-orm";
import { z } from "zod/v4";
import { getClientROI } from "../../services/analytics/roi";
import { requireRole } from "../../middleware/auth";

const router: IRouter = Router();

interface StakeholderToken {
  stakeholderId: number;
  clientId: number;
  email: string;
  purpose: "client_portal";
}

declare global {
  namespace Express {
    interface Request {
      stakeholder?: StakeholderToken;
    }
  }
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

function signStakeholderToken(payload: StakeholderToken): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "4h" });
}

function authenticateStakeholder(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as StakeholderToken;
    if (decoded.purpose !== "client_portal") {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.stakeholder = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

router.post("/client-portal/request-pin", async (req, res): Promise<void> => {
  const schema = z.object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
  }).refine((d) => d.email || d.phone, { message: "email or phone is required" });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email or phone is required" });
    return;
  }

  const conditions = [];
  if (parsed.data.email) {
    conditions.push(eq(clientStakeholdersTable.email, parsed.data.email.toLowerCase()));
  }
  if (parsed.data.phone) {
    conditions.push(eq(clientStakeholdersTable.phone, parsed.data.phone));
  }

  const stakeholders = await db
    .select()
    .from(clientStakeholdersTable)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions));

  if (stakeholders.length === 0) {
    res.json({ message: "If an account exists, a PIN has been sent." });
    return;
  }

  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const pinExpiry = new Date(Date.now() + 10 * 60 * 1000);
  const hashedPin = crypto.createHash("sha256").update(pin).digest("hex");

  for (const stakeholder of stakeholders) {
    await db
      .update(clientStakeholdersTable)
      .set({ lastPin: hashedPin, pinExpiry })
      .where(eq(clientStakeholdersTable.id, stakeholder.id));
  }

  // TODO: integrate email/SMS delivery service to send PIN
  if (process.env.NODE_ENV !== "production") {
    console.log(`[client-portal] PIN generated for ${parsed.data.email || parsed.data.phone}`);
  }

  res.json({ message: "If an account exists, a PIN has been sent." });
});

router.post("/client-portal/verify-pin", async (req, res): Promise<void> => {
  const schema = z.object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    pin: z.string().length(6),
  }).refine((d) => d.email || d.phone, { message: "email or phone is required" });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email/phone and 6-digit PIN are required" });
    return;
  }

  const hashedPin = crypto.createHash("sha256").update(parsed.data.pin).digest("hex");

  const identityCondition = parsed.data.email
    ? eq(clientStakeholdersTable.email, parsed.data.email.toLowerCase())
    : eq(clientStakeholdersTable.phone, parsed.data.phone!);

  const [stakeholder] = await db
    .select()
    .from(clientStakeholdersTable)
    .where(and(identityCondition, eq(clientStakeholdersTable.lastPin, hashedPin)));

  if (!stakeholder) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  if (!stakeholder.pinExpiry || new Date() > stakeholder.pinExpiry) {
    res.status(401).json({ error: "PIN has expired. Please request a new one." });
    return;
  }

  await db
    .update(clientStakeholdersTable)
    .set({ lastPin: null, pinExpiry: null })
    .where(eq(clientStakeholdersTable.id, stakeholder.id));

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, stakeholder.clientId));

  const token = signStakeholderToken({
    stakeholderId: stakeholder.id,
    clientId: stakeholder.clientId,
    email: stakeholder.email,
    purpose: "client_portal",
  });

  res.json({
    token,
    stakeholder: {
      id: stakeholder.id,
      name: stakeholder.name,
      email: stakeholder.email,
      clientId: stakeholder.clientId,
      companyName: client?.companyName ?? "Unknown",
    },
  });
});

router.get("/client-portal/me", authenticateStakeholder, async (req, res): Promise<void> => {
  const { stakeholderId, clientId } = req.stakeholder!;

  const [stakeholder] = await db
    .select()
    .from(clientStakeholdersTable)
    .where(eq(clientStakeholdersTable.id, stakeholderId));

  if (!stakeholder) {
    res.status(404).json({ error: "Stakeholder not found" });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  res.json({
    id: stakeholder.id,
    name: stakeholder.name,
    email: stakeholder.email,
    clientId: stakeholder.clientId,
    companyName: client?.companyName ?? "Unknown",
  });
});

router.get("/client-portal/roi", authenticateStakeholder, async (req, res): Promise<void> => {
  const { clientId } = req.stakeholder!;

  try {
    const roi = await getClientROI(clientId);
    res.json(roi);
  } catch {
    res.status(500).json({ error: "Failed to fetch ROI data" });
  }
});

router.get("/client-portal/missions", authenticateStakeholder, async (req, res): Promise<void> => {
  const { clientId } = req.stakeholder!;

  const sessions = await db
    .select()
    .from(taskSessionsTable)
    .where(eq(taskSessionsTable.clientId, clientId))
    .orderBy(desc(taskSessionsTable.createdAt))
    .limit(20);

  const result = await Promise.all(
    sessions.map(async (s) => {
      const sessionBotRows = await db
        .select()
        .from(taskSessionBotsTable)
        .where(eq(taskSessionBotsTable.sessionId, s.id));
      const botIds = sessionBotRows.map((sb) => sb.botId);
      let teamBots: { id: number; name: string; title: string; department: string }[] = [];
      if (botIds.length > 0) {
        teamBots = await db
          .select({ id: botsTable.id, name: botsTable.name, title: botsTable.title, department: botsTable.department })
          .from(botsTable)
          .where(inArray(botsTable.id, botIds));
      }

      const [outcome] = await db
        .select()
        .from(sessionOutcomesTable)
        .where(eq(sessionOutcomesTable.sessionId, s.id));

      return {
        id: s.id,
        objective: s.objective,
        status: s.status,
        createdAt: s.createdAt,
        teamBots,
        outcome: outcome ? {
          summary: outcome.outcomeSummary,
          hoursSaved: Number(outcome.estimatedHoursSaved),
          department: outcome.department,
        } : null,
      };
    })
  );

  res.json(result);
});

router.get("/client-portal/missions/:id/debrief", authenticateStakeholder, async (req, res): Promise<void> => {
  const { clientId } = req.stakeholder!;
  const sessionId = Number(req.params.id);

  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(taskSessionsTable)
    .where(and(eq(taskSessionsTable.id, sessionId), eq(taskSessionsTable.clientId, clientId)));

  if (!session) {
    res.status(404).json({ error: "Mission not found" });
    return;
  }

  const messages = await db
    .select()
    .from(taskSessionMessagesTable)
    .where(eq(taskSessionMessagesTable.sessionId, sessionId))
    .orderBy(taskSessionMessagesTable.createdAt);

  const textMessages = messages
    .filter((m) => m.messageType === "text")
    .map((m) => ({
      id: m.id,
      botName: m.botName,
      botTitle: m.botTitle,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));

  const [outcome] = await db
    .select()
    .from(sessionOutcomesTable)
    .where(eq(sessionOutcomesTable.sessionId, sessionId));

  res.json({
    session: {
      id: session.id,
      objective: session.objective,
      status: session.status,
      createdAt: session.createdAt,
    },
    messages: textMessages,
    outcome: outcome ? {
      summary: outcome.outcomeSummary,
      hoursSaved: Number(outcome.estimatedHoursSaved),
      department: outcome.department,
      toolsUsed: outcome.toolsExecutedTotal,
    } : null,
  });
});

router.get("/client-portal/approvals", authenticateStakeholder, async (req, res): Promise<void> => {
  const { clientId } = req.stakeholder!;
  const status = (req.query.status as string) || "pending";

  const approvals = await db
    .select()
    .from(pendingApprovalsTable)
    .where(
      and(
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, status)
      )
    )
    .orderBy(desc(pendingApprovalsTable.createdAt));

  res.json(approvals.map((a) => ({
    id: a.id,
    botName: a.botName,
    toolName: a.toolName,
    toolInput: a.toolInput,
    status: a.status,
    createdAt: a.createdAt,
    resolvedAt: a.resolvedAt,
  })));
});

router.patch("/client-portal/approvals/:id", authenticateStakeholder, async (req, res): Promise<void> => {
  const { clientId, stakeholderId } = req.stakeholder!;
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid approval ID" });
    return;
  }

  const schema = z.object({
    action: z.enum(["approve", "reject"]),
    reason: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }

  const newStatus = parsed.data.action === "approve" ? "approved" : "rejected";

  const [updated] = await db
    .update(pendingApprovalsTable)
    .set({
      status: newStatus,
      resolvedBy: stakeholderId,
      resolvedAt: new Date(),
      ...(parsed.data.action === "reject" ? { rejectionReason: parsed.data.reason || "Rejected by stakeholder" } : {}),
    })
    .where(
      and(
        eq(pendingApprovalsTable.id, id),
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, "pending")
      )
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Approval not found or already resolved" });
    return;
  }

  res.json({
    id: updated.id,
    status: updated.status,
    resolvedAt: updated.resolvedAt,
  });
});

router.get("/client-portal/stakeholders", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const userClientId = req.user!.clientId;
  const clientId = Number(req.query.clientId);

  if (isNaN(clientId) || clientId !== userClientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const stakeholders = await db
    .select({
      id: clientStakeholdersTable.id,
      clientId: clientStakeholdersTable.clientId,
      name: clientStakeholdersTable.name,
      email: clientStakeholdersTable.email,
      phone: clientStakeholdersTable.phone,
      createdAt: clientStakeholdersTable.createdAt,
    })
    .from(clientStakeholdersTable)
    .where(eq(clientStakeholdersTable.clientId, userClientId));

  res.json(stakeholders);
});

router.post("/client-portal/stakeholders", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const userClientId = req.user!.clientId;

  const schema = z.object({
    clientId: z.number(),
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.clientId !== userClientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const [stakeholder] = await db
      .insert(clientStakeholdersTable)
      .values({
        clientId: userClientId,
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone || null,
      })
      .returning();

    res.status(201).json({
      id: stakeholder.id,
      clientId: stakeholder.clientId,
      name: stakeholder.name,
      email: stakeholder.email,
      phone: stakeholder.phone,
      createdAt: stakeholder.createdAt,
    });
  } catch (err: unknown) {
    const pgErr = err as { constraint?: string };
    if (pgErr?.constraint === "client_stakeholder_email_unique") {
      res.status(409).json({ error: "A stakeholder with this email already exists for this client" });
      return;
    }
    throw err;
  }
});

router.delete("/client-portal/stakeholders/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const userClientId = req.user!.clientId;
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid stakeholder ID" });
    return;
  }

  const [deleted] = await db
    .delete(clientStakeholdersTable)
    .where(
      and(
        eq(clientStakeholdersTable.id, id),
        eq(clientStakeholdersTable.clientId, userClientId)
      )
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Stakeholder not found" });
    return;
  }

  res.json({ success: true });
});

router.post("/client-portal/stakeholders/:id/resend-pin", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const userClientId = req.user!.clientId;
  const id = Number(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid stakeholder ID" });
    return;
  }

  const [stakeholder] = await db
    .select()
    .from(clientStakeholdersTable)
    .where(
      and(
        eq(clientStakeholdersTable.id, id),
        eq(clientStakeholdersTable.clientId, userClientId)
      )
    );

  if (!stakeholder) {
    res.status(404).json({ error: "Stakeholder not found" });
    return;
  }

  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const pinExpiry = new Date(Date.now() + 10 * 60 * 1000);
  const hashedPin = crypto.createHash("sha256").update(pin).digest("hex");

  await db
    .update(clientStakeholdersTable)
    .set({ lastPin: hashedPin, pinExpiry })
    .where(eq(clientStakeholdersTable.id, id));

  // TODO: integrate email/SMS delivery service to send PIN
  if (process.env.NODE_ENV !== "production") {
    console.log(`[client-portal] PIN resent for ${stakeholder.email}`);
  }

  res.json({ message: `PIN sent to ${stakeholder.email}` });
});

export default router;
