import { Router } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerAllTools } from "../tools/index.js";
import { registerResourcesAndPrompts } from "../resources.js";
import { authenticateOptional, type AuthResult, type AuthenticatedRequest } from "../auth.js";
import {
  transports,
  activeSessions,
  sessionAuthMap,
  trialCallsMap,
  TRIAL_MAX_CALLS,
  incrementToolCallsServed,
  type ActiveSession,
} from "../sessions.js";

export function buildMcpRoutes(basePath: string): Router {
  const router = Router();

  router.get(`${basePath}/sse`, authenticateOptional, async (req: AuthenticatedRequest, res) => {
    console.log("[MCP] New SSE connection request");

    const isTrial = !req.authResult;
    const authResult: AuthResult = req.authResult ?? {
      callerType: "piratemonster",
      partnerKeyId: null,
      rateLimit: TRIAL_MAX_CALLS,
      tokenHash: "",
      allowedTools: ["request_demo", "calculate_roi", "get_pricing_recommendation", "generate_roi_report"],
    };

    const sessionCtx = {
      partnerKeyId: authResult.partnerKeyId,
      rateLimit: authResult.rateLimit,
      allowedTools: authResult.allowedTools,
    };

    const server = new McpServer({
      name: "galaxybots-mcp",
      version: "1.0.0",
    });

    try {
      registerAllTools(server, authResult.callerType, sessionCtx);
      await registerResourcesAndPrompts(server);
    } catch (err) {
      console.error("[MCP] Error registering tools:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to initialize MCP session" });
      }
      return;
    }

    const transport = new SSEServerTransport(`${basePath}/messages`, res);
    transports.set(transport.sessionId, transport);
    sessionAuthMap.set(transport.sessionId, authResult);

    if (isTrial) {
      trialCallsMap.set(transport.sessionId, 0);
      console.log(`[MCP] Trial session started: ${transport.sessionId} (max ${TRIAL_MAX_CALLS} calls)`);
    }

    const clientName = isTrial
      ? "Trial (unauthenticated)"
      : authResult.oauthClientId
      ? `OAuth:${authResult.oauthClientId}`
      : authResult.callerType === "galaxybots"
      ? "GalaxyBots Internal"
      : `PM Key ${authResult.partnerKeyId}`;

    const sessionInfo: ActiveSession = {
      sessionId: transport.sessionId,
      clientName,
      connectedAt: new Date(),
      toolCallCount: 0,
      callerType: authResult.callerType,
      oauthClientId: authResult.oauthClientId,
      partnerKeyId: authResult.partnerKeyId,
    };
    activeSessions.set(transport.sessionId, sessionInfo);

    res.on("close", () => {
      console.log(`[MCP] SSE connection closed: ${transport.sessionId}`);
      transports.delete(transport.sessionId);
      sessionAuthMap.delete(transport.sessionId);
      activeSessions.delete(transport.sessionId);
      trialCallsMap.delete(transport.sessionId);
    });

    console.log(`[MCP] SSE connection established: ${transport.sessionId} (caller: ${isTrial ? "trial" : authResult.callerType})`);
    try {
      await server.connect(transport);
    } catch (err) {
      console.error(`[MCP] Error connecting transport for session ${transport.sessionId}:`, err);
      transports.delete(transport.sessionId);
      sessionAuthMap.delete(transport.sessionId);
      activeSessions.delete(transport.sessionId);
      trialCallsMap.delete(transport.sessionId);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  router.post(`${basePath}/messages`, authenticateOptional, async (req: AuthenticatedRequest, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const sessionAuth = sessionAuthMap.get(sessionId);
    const isTrial = trialCallsMap.has(sessionId);

    if (isTrial) {
      const trialCalls = trialCallsMap.get(sessionId) ?? 0;
      if (trialCalls >= TRIAL_MAX_CALLS) {
        res.status(402).json({
          error: "trial_exhausted",
          message: `You have used all ${TRIAL_MAX_CALLS} free trial calls. Sign up for API access to continue.`,
          signup_url: "https://galaxybots.ai/api-access",
          booking_link: "https://calendly.com/galaxybots/demo",
          hint: "Use the `request_demo` tool to book a live demo and get full access.",
        });
        return;
      }
      trialCallsMap.set(sessionId, trialCalls + 1);
    } else {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) {
        res.status(401).json({ error: "Missing or invalid Authorization header. Expected: Bearer <API_KEY>" });
        return;
      }
      if (req.authResult && sessionAuth && sessionAuth.tokenHash && sessionAuth.tokenHash !== req.authResult.tokenHash) {
        res.status(403).json({ error: "Token mismatch: this session belongs to a different key" });
        return;
      }
      if (!req.authResult) {
        res.status(401).json({ error: "Invalid or expired API key" });
        return;
      }
    }

    const session = activeSessions.get(sessionId);
    if (session) {
      session.toolCallCount++;
      incrementToolCallsServed();
    }

    try {
      await transport.handlePostMessage(req, res);
    } catch (err) {
      console.error(`[MCP] Error handling message for session ${sessionId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  return router;
}
