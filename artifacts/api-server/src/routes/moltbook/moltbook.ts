import { Router, type IRouter } from "express";
import { db, moltbookAccountsTable, moltbookApprovalQueueTable, botsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { authenticate, requireRole } from "../../middleware/auth";
import {
  checkAgentEligibility,
  registerMoltbookAgent,
  refreshMoltbookClaimStatus,
  toSafeAccount,
  approveAndSendDraft,
  rejectDraft,
} from "../../services/platform/moltbook-service";

const router: IRouter = Router();

const RegisterSchema = z.object({
  botId: z.number().int().positive(),
  agentName: z.string().min(1),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  xHandle: z.string().optional(),
});

const EditApproveSchema = z.object({
  body: z.string().min(1).optional(),
});

function decider(req: { user?: { email?: string; userId?: number } }): string {
  return req.user?.email ?? `user:${req.user?.userId ?? "unknown"}`;
}

router.post("/moltbook/register", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  try {
    const result = await registerMoltbookAgent(parsed.data);
    if (!result.success) {
      res.status(result.error?.includes("not eligible") || result.error?.includes("restricted") || result.error?.includes("allowlist") ? 403 : 502).json({ error: result.error });
      return;
    }
    res.json({ account: result.account });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to register Moltbook agent" });
  }
});

router.get("/moltbook/eligibility/:botId", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const botId = Number(req.params.botId);
  if (!Number.isInteger(botId) || botId <= 0) {
    res.status(400).json({ error: "Invalid botId" });
    return;
  }
  try {
    const result = await checkAgentEligibility(botId);
    res.json({ eligible: result.eligible, reason: result.reason });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Eligibility check failed" });
  }
});

router.get("/moltbook/accounts", authenticate, requireRole("owner"), async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({ account: moltbookAccountsTable, botName: botsTable.name, department: botsTable.department })
      .from(moltbookAccountsTable)
      .leftJoin(botsTable, eq(moltbookAccountsTable.botId, botsTable.id))
      .orderBy(desc(moltbookAccountsTable.createdAt));
    res.json({
      accounts: rows.map((r) => ({ ...toSafeAccount(r.account), botName: r.botName, department: r.department })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list accounts" });
  }
});

router.get("/moltbook/accounts/:botId/status", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const botId = Number(req.params.botId);
  if (!Number.isInteger(botId) || botId <= 0) {
    res.status(400).json({ error: "Invalid botId" });
    return;
  }
  try {
    const result = await refreshMoltbookClaimStatus(botId);
    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ account: result.account });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch status" });
  }
});

router.patch("/moltbook/accounts/:id/autonomous", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const enabled = Boolean(req.body?.enabled);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid account id" });
    return;
  }
  try {
    const [updated] = await db
      .update(moltbookAccountsTable)
      .set({ autonomousMode: enabled })
      .where(eq(moltbookAccountsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json({ account: toSafeAccount(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update autonomous mode" });
  }
});

router.post("/moltbook/accounts/:id/disable", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid account id" });
    return;
  }
  try {
    const [updated] = await db
      .update(moltbookAccountsTable)
      .set({ status: "disabled", autonomousMode: false })
      .where(eq(moltbookAccountsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json({ account: toSafeAccount(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to disable account" });
  }
});

router.post("/moltbook/accounts/:id/enable", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid account id" });
    return;
  }
  try {
    const [updated] = await db
      .update(moltbookAccountsTable)
      .set({ status: "active" })
      .where(eq(moltbookAccountsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json({ account: toSafeAccount(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to enable account" });
  }
});

router.get("/moltbook/queue", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const validStatuses = ["pending", "approved", "rejected", "sent"] as const;
  const filter = (validStatuses as readonly string[]).includes(status) ? (status as (typeof validStatuses)[number]) : "pending";
  try {
    const rows = await db
      .select({ draft: moltbookApprovalQueueTable, botName: botsTable.name, agentName: moltbookAccountsTable.agentName })
      .from(moltbookApprovalQueueTable)
      .leftJoin(botsTable, eq(moltbookApprovalQueueTable.botId, botsTable.id))
      .leftJoin(moltbookAccountsTable, eq(moltbookApprovalQueueTable.accountId, moltbookAccountsTable.id))
      .where(eq(moltbookApprovalQueueTable.status, filter))
      .orderBy(desc(moltbookApprovalQueueTable.createdAt));
    res.json({ items: rows.map((r) => ({ ...r.draft, botName: r.botName, agentName: r.agentName })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list queue" });
  }
});

router.post("/moltbook/queue/:id/approve", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid draft id" });
    return;
  }
  const parsed = EditApproveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const result = await approveAndSendDraft({
      draftId: id,
      clientId: req.user?.clientId,
      decidedBy: decider(req),
      editedBody: parsed.data.body,
    });
    if (!result.success) {
      res.status(result.error === "Draft not found." ? 404 : 502).json({ error: result.error });
      return;
    }
    res.json({ draft: result.draft, url: result.url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to approve draft" });
  }
});

router.post("/moltbook/queue/:id/reject", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid draft id" });
    return;
  }
  try {
    const result = await rejectDraft({ draftId: id, decidedBy: decider(req) });
    if (!result.success) {
      res.status(result.error === "Draft not found." ? 404 : 400).json({ error: result.error });
      return;
    }
    res.json({ draft: result.draft });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to reject draft" });
  }
});

export default router;
