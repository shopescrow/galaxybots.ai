/**
 * GalaxyBots MCP Server
 *
 * A Model Context Protocol server that exposes GalaxyBots capabilities
 * as callable tools for Replit Agent and any MCP-compatible AI client.
 *
 * === How to register as a custom MCP server in Replit ===
 *
 * 1. Set the MCP_API_KEY environment secret in your Replit project.
 * 2. Add this server as a custom MCP server with:
 *    - SSE URL: https://<your-repl-domain>/__mcp/sse
 *    - Headers: { "Authorization": "Bearer <MCP_API_KEY>" }
 *
 * The server implements the MCP protocol over SSE (HTTP transport).
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerAllTools } from "./tools/index.js";

const MCP_API_KEY = process.env.MCP_API_KEY;
if (!MCP_API_KEY) {
  console.error("MCP_API_KEY environment secret is required but not set.");
  process.exit(1);
}

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const BASE_PATH = (process.env.BASE_PATH || "/__mcp").replace(/\/+$/, "");

const app = express();

const transports = new Map<string, SSEServerTransport>();

function authenticate(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Expected: Bearer <MCP_API_KEY>" });
    return;
  }
  const token = authHeader.slice(7);
  if (token !== MCP_API_KEY) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  next();
}

app.get(`${BASE_PATH}/sse`, authenticate, async (req, res) => {
  console.log("[MCP] New SSE connection request");

  const server = new McpServer({
    name: "galaxybots-mcp",
    version: "1.0.0",
  });

  registerAllTools(server);

  const transport = new SSEServerTransport(`${BASE_PATH}/messages`, res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    console.log(`[MCP] SSE connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  console.log(`[MCP] SSE connection established: ${transport.sessionId}`);
  await server.connect(transport);
});

app.post(`${BASE_PATH}/messages`, authenticate, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.get(`${BASE_PATH}/health`, (_req, res) => {
  res.json({ status: "ok", service: "galaxybots-mcp" });
});

app.listen(port, () => {
  console.log(`[MCP] GalaxyBots MCP Server listening on port ${port}`);
  console.log(`[MCP] SSE endpoint: ${BASE_PATH}/sse`);
  console.log(`[MCP] Messages endpoint: ${BASE_PATH}/messages`);
});
