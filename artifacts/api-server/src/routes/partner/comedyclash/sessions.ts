import { Router, type IRouter } from "express";
import { db, botsTable, taskSessionsTable, taskSessionBotsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { enqueueComedyClashEvent } from "../../../services/platform/partner-webhook-emitter.js";

const router: IRouter = Router();

router.post("/integrations/comedyclash/sessions", async (req, res): Promise<void> => {
  try {
    const { botId, input, webhookUrl } = req.body || {};

    if (!botId || !input) {
      res.status(400).json({ error: "botId and input are required" });
      return;
    }

    // Always derive clientId from the authenticated API key — never trust body.
    const resolvedClientId = req.user!.clientId;

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(
        and(
          eq(botsTable.id, Number(botId)),
          eq(botsTable.isAvailable, true),
        )
      )
      .limit(1);

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const [session] = await db.insert(taskSessionsTable).values({
      clientId: resolvedClientId,
      objective: String(input),
      status: "active",
    }).returning();

    await db.insert(taskSessionBotsTable).values({
      sessionId: session.id,
      botId: bot.id,
      role: "member",
    });

    const apiBase = process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/api`
      : process.env["GALAXYBOTS_API_URL"] || "/api";

    // Emit session.started outbound event to ComedyClash webhook subscriptions.
    enqueueComedyClashEvent("session.started", {
      sessionId: session.id,
      botId: bot.id,
      botName: bot.name,
      objective: String(input),
      webhookUrl: webhookUrl ?? null,
    }, resolvedClientId).catch((err) => {
      console.error("[CC] Failed to enqueue session.started event:", err instanceof Error ? err.message : err);
    });

    console.log(`[CC] Session ${session.id} created for bot ${botId} (client ${resolvedClientId})`);

    res.status(202).json({
      sessionId: session.id,
      status: session.status,
      resultUrl: `${apiBase}/integrations/comedyclash/sessions/${session.id}/result`,
      streamUrl: `${apiBase}/integrations/comedyclash/sessions/${session.id}/stream`,
      webhookUrl: webhookUrl || null,
      botId: bot.id,
    });
  } catch (err) {
    console.error("[CC] Error starting session:", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

// Internal endpoint — callable only via comedyclash platform API key — to mark a session
// completed or failed and emit the corresponding outbound event to CC webhook subscriptions.
router.patch("/integrations/comedyclash/sessions/:sessionId/status", async (req, res): Promise<void> => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

    const { status, output } = req.body || {};
    if (!["completed", "failed"].includes(status)) {
      res.status(400).json({ error: "status must be completed or failed" });
      return;
    }

    const clientId = req.user!.clientId;

    const [session] = await db
      .update(taskSessionsTable)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(taskSessionsTable.id, sessionId),
          eq(taskSessionsTable.clientId, clientId),
        )
      )
      .returning();

    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const eventSlug = status === "completed" ? "session.completed" : "session.failed";
    enqueueComedyClashEvent(eventSlug, {
      sessionId: session.id,
      status,
      output: output ?? null,
      updatedAt: session.updatedAt,
    }, clientId).catch((err) => {
      console.error(`[CC] Failed to enqueue ${eventSlug} event:`, err instanceof Error ? err.message : err);
    });

    res.json({ sessionId: session.id, status: session.status });
  } catch (err) {
    console.error("[CC] Error updating session status:", err);
    res.status(500).json({ error: "Failed to update session status" });
  }
});

// SSE stream endpoint — CC polls this for real-time session status updates.
router.get("/integrations/comedyclash/sessions/:sessionId/stream", async (req, res): Promise<void> => {
  const sessionId = Number(req.params.sessionId);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const clientId = req.user!.clientId;

  // Verify ownership before opening the stream.
  const [session] = await db
    .select({ id: taskSessionsTable.id, status: taskSessionsTable.status })
    .from(taskSessionsTable)
    .where(and(eq(taskSessionsTable.id, sessionId), eq(taskSessionsTable.clientId, clientId)))
    .limit(1);

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const POLL_INTERVAL_MS = 3000;
  let lastStatus = session.status;

  function sendEvent(data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  sendEvent({ sessionId, status: lastStatus, event: "status" });

  const interval = setInterval(async () => {
    try {
      const [current] = await db
        .select({ status: taskSessionsTable.status, updatedAt: taskSessionsTable.updatedAt })
        .from(taskSessionsTable)
        .where(eq(taskSessionsTable.id, sessionId))
        .limit(1);

      if (!current) { clearInterval(interval); res.end(); return; }

      if (current.status !== lastStatus) {
        lastStatus = current.status;
        sendEvent({ sessionId, status: current.status, updatedAt: current.updatedAt, event: "status_change" });
      }

      if (current.status === "completed" || current.status === "failed") {
        sendEvent({ sessionId, status: current.status, event: "done" });
        clearInterval(interval);
        res.end();
      }
    } catch {
      clearInterval(interval);
      res.end();
    }
  }, POLL_INTERVAL_MS);

  req.on("close", () => { clearInterval(interval); });
});

export default router;

