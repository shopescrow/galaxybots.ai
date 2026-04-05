import type http from "node:http";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createApp } from "./app.js";
import { runStartupHealthCheck } from "./api-client.js";

let httpServer: http.Server | null = null;

process.on("uncaughtException", (err) => {
  console.error("[MCP] Uncaught exception — initiating graceful shutdown:", err);
  if (httpServer) {
    httpServer.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000);
  } else {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[MCP] Unhandled rejection (keeping server alive):", reason);
});

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const BASE_PATH = (process.env.BASE_PATH || "/__mcp").replace(/\/+$/, "");

async function verifyDbConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    console.log("[MCP] Database connection verified");
    return true;
  } catch (err) {
    console.error("[MCP] Database connection failed:", err);
    return false;
  }
}

function tryListenOnPort(app: ReturnType<typeof createApp>, portToTry: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = app.listen(portToTry, () => {
      httpServer = server as unknown as http.Server;
      console.log(`[MCP] GalaxyBots MCP Server listening on port ${portToTry}`);
      console.log(`[MCP] SSE endpoint: ${BASE_PATH}/sse`);
      console.log(`[MCP] Messages endpoint: ${BASE_PATH}/messages`);
      console.log(`[MCP] OAuth authorize: ${BASE_PATH}/oauth/authorize`);
      console.log(`[MCP] OAuth token: ${BASE_PATH}/oauth/token`);
      console.log(`[MCP] Tool manifest: ${BASE_PATH}/tools`);
      console.log(`[MCP] Well-known: /.well-known/mcp.json`);
      resolve(true);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`[MCP] Port ${portToTry} already in use, trying next port...`);
        server.close();
        resolve(false);
      } else {
        console.error("[MCP] Server error:", err);
        server.close();
        resolve(false);
      }
    });
  });
}

async function startServer() {
  const dbOk = await verifyDbConnection();
  if (!dbOk) {
    console.error("[MCP] Cannot start: database connection failed");
    process.exit(1);
  }

  const app = createApp();

  const candidatePorts = [port, port + 1, port + 2];
  let started = false;
  for (const p of candidatePorts) {
    started = await tryListenOnPort(app, p);
    if (started) break;
  }

  if (!started) {
    console.error(`[MCP] Could not bind to any port in [${candidatePorts.join(", ")}] — exiting`);
    process.exit(1);
  }

  runStartupHealthCheck().catch((err) => {
    console.error("[MCP] Startup health check failed:", err);
  });
}

startServer().catch((err) => {
  console.error("[MCP] Fatal startup error:", err);
  process.exit(1);
});
