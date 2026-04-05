import { Router } from "express";
import { MCP_API_KEY } from "../auth.js";
import { activeSessions, cleanupSession } from "../sessions.js";

export function buildAdminRoutes(basePath: string): Router {
  const router = Router();

  router.get(`${basePath}/sessions`, (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token || !MCP_API_KEY || token !== MCP_API_KEY) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const sessions = Array.from(activeSessions.values()).map(s => ({
      sessionId: s.sessionId,
      clientName: s.clientName,
      connectedAt: s.connectedAt.toISOString(),
      toolCallCount: s.toolCallCount,
      callerType: s.callerType,
      oauthClientId: s.oauthClientId ?? null,
      partnerKeyId: s.partnerKeyId,
    }));
    res.json({ sessions, count: sessions.length });
  });

  router.delete(`${basePath}/sessions/:sessionId`, (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token || !MCP_API_KEY || token !== MCP_API_KEY) {
      res.status(401).json({ error: "Unauthorized — admin key required" });
      return;
    }
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    cleanupSession(sessionId);
    console.log(`[MCP] Session ${sessionId} forcibly terminated by admin`);
    res.json({ terminated: true, sessionId });
  });

  return router;
}
