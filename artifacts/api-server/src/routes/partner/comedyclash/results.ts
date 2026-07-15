import { Router, type IRouter } from "express";
import { db, taskSessionsTable, taskSessionMessagesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/integrations/comedyclash/sessions/:sessionId/result", async (req, res): Promise<void> => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (isNaN(sessionId)) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }

    const clientId = req.user!.clientId;

    const [session] = await db
      .select()
      .from(taskSessionsTable)
      .where(
        and(
          eq(taskSessionsTable.id, sessionId),
          eq(taskSessionsTable.clientId, clientId),
        )
      )
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const messages = await db
      .select()
      .from(taskSessionMessagesTable)
      .where(eq(taskSessionMessagesTable.sessionId, sessionId))
      .orderBy(desc(taskSessionMessagesTable.createdAt))
      .limit(50);

    const botMessages = messages
      .filter((m) => m.role === "bot" || m.role === "assistant")
      .reverse();

    const lastBotMessage = botMessages[botMessages.length - 1];

    res.json({
      sessionId,
      status: session.status,
      result: lastBotMessage ? { content: lastBotMessage.content, role: lastBotMessage.role } : null,
      messageCount: messages.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  } catch (err) {
    console.error("[CC] Error fetching session result:", err);
    res.status(500).json({ error: "Failed to fetch session result" });
  }
});

export default router;
