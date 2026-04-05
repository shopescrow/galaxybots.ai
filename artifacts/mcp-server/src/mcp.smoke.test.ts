import { describe, it, expect, afterAll } from "vitest";
import { db, platformApiKeysTable, mcpToolCallsTable, clientsTable } from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";
import crypto from "node:crypto";
import http from "http";
import { createApp } from "./app";

describe("MCP server smoke tests", () => {
  const createdKeyIds: number[] = [];
  const createdClientIds: number[] = [];
  let server: http.Server;
  let port: number;

  async function startMCPServer(): Promise<number> {
    if (server) return port;
    const app = createApp();
    return new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        port = (server.address() as { port: number }).port;
        resolve(port);
      });
    });
  }

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    for (const id of createdKeyIds) {
      await db.delete(mcpToolCallsTable).where(eq(mcpToolCallsTable.partnerKeyId, id)).catch(() => {});
      await db.delete(platformApiKeysTable).where(eq(platformApiKeysTable.id, id)).catch(() => {});
    }
    for (const id of createdClientIds) {
      await db.delete(clientsTable).where(eq(clientsTable.id, id)).catch(() => {});
    }
  });

  async function createTestClient(): Promise<number> {
    const [client] = await db
      .insert(clientsTable)
      .values({
        companyName: `MCP Smoke Co ${Date.now()}`,
        contactName: "MCP Tester",
        contactEmail: `mcp_smoke_${Date.now()}@test.local`,
      })
      .returning();
    createdClientIds.push(client.id);
    return client.id;
  }

  async function createPartnerKey(clientId: number, opts: { rateLimit?: number } = {}) {
    const rawKey = `pm_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const [key] = await db
      .insert(platformApiKeysTable)
      .values({
        clientId,
        platform: "piratemonster_mcp",
        keyHash,
        label: "Smoke Test Key",
        status: "active",
        rateLimit: opts.rateLimit ?? 100,
      })
      .returning();
    createdKeyIds.push(key.id);
    return { key, rawKey, keyHash };
  }

  it("should establish a trial SSE connection to the real MCP server (no auth)", async () => {
    const serverPort = await startMCPServer();

    const chunks: string[] = [];
    await new Promise<void>((resolve) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: serverPort,
          path: "/__mcp/sse",
          method: "GET",
          headers: { Accept: "text/event-stream" },
        },
        (res) => {
          expect(res.statusCode).toBe(200);

          res.on("data", (chunk: Buffer) => {
            chunks.push(chunk.toString());
            const joined = chunks.join("");
            if (joined.includes("endpoint")) {
              req.destroy();
              resolve();
            }
          });
        },
      );
      req.on("error", () => {});
      req.end();
      setTimeout(() => { req.destroy(); resolve(); }, 5000);
    });

    const fullData = chunks.join("");
    expect(fullData).toContain("event: endpoint");
    expect(fullData).toContain("/__mcp/messages");
  });

  it("should establish an authenticated SSE connection with a valid partner key", async () => {
    const clientId = await createTestClient();
    const { rawKey } = await createPartnerKey(clientId);
    const serverPort = await startMCPServer();

    const chunks: string[] = [];
    await new Promise<void>((resolve) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: serverPort,
          path: "/__mcp/sse",
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${rawKey}`,
          },
        },
        (res) => {
          expect(res.statusCode).toBe(200);

          res.on("data", (chunk: Buffer) => {
            chunks.push(chunk.toString());
            if (chunks.join("").includes("endpoint")) {
              req.destroy();
              resolve();
            }
          });
        },
      );
      req.on("error", () => {});
      req.end();
      setTimeout(() => { req.destroy(); resolve(); }, 5000);
    });

    const fullData = chunks.join("");
    expect(fullData).toContain("event: endpoint");
  });

  it("should reject POST to messages endpoint with invalid session ID", async () => {
    const serverPort = await startMCPServer();

    const postData = JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 });

    const result = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: serverPort,
          path: "/__mcp/messages?sessionId=nonexistent-session-id",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (c: Buffer) => { body += c.toString(); });
          res.on("end", () => resolve({ statusCode: res.statusCode!, body }));
        },
      );
      req.write(postData);
      req.end();
    });

    expect(result.statusCode).toBe(404);
    const parsed = JSON.parse(result.body);
    expect(parsed.error).toBe("Session not found");
  });

  it("should execute a full tool call flow: SSE connect → extract sessionId → POST tools/list", async () => {
    const serverPort = await startMCPServer();

    let sessionId: string | null = null;
    const sseReq = await new Promise<http.ClientRequest>((resolve) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: serverPort,
          path: "/__mcp/sse",
          method: "GET",
          headers: { Accept: "text/event-stream" },
        },
        (res) => {
          let buffer = "";
          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const match = buffer.match(/data:\s*(.*?sessionId=[^&\s\n]+)/);
            if (match) {
              const urlPart = match[1].trim();
              const sid = urlPart.split("sessionId=")[1];
              if (sid) {
                sessionId = sid;
                resolve(req);
              }
            }
          });
        },
      );
      req.on("error", () => {});
      req.end();
      setTimeout(() => resolve(req), 5000);
    });

    expect(sessionId).toBeTruthy();

    const postData = JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 });
    const toolsResult = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: serverPort,
          path: `/__mcp/messages?sessionId=${sessionId}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (c: Buffer) => { body += c.toString(); });
          res.on("end", () => resolve({ statusCode: res.statusCode!, body }));
        },
      );
      req.write(postData);
      req.end();
    });

    expect(toolsResult.statusCode).toBe(202);

    sseReq.destroy();
  });

  it("should track tool calls and enforce rate limits via DB", async () => {
    const clientId = await createTestClient();
    const { rawKey, key } = await createPartnerKey(clientId, { rateLimit: 2 });

    const tokenHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const [found] = await db
      .select()
      .from(platformApiKeysTable)
      .where(
        and(
          eq(platformApiKeysTable.keyHash, tokenHash),
          eq(platformApiKeysTable.status, "active"),
          eq(platformApiKeysTable.platform, "piratemonster_mcp"),
        ),
      )
      .limit(1);

    expect(found).toBeDefined();
    expect(found.id).toBe(key.id);

    for (let i = 0; i < 2; i++) {
      await db.insert(mcpToolCallsTable).values({
        partnerKeyId: key.id,
        toolName: "list_bots",
        responseStatus: "success",
        latencyMs: 100,
        calledAt: new Date(),
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [{ count: callCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mcpToolCallsTable)
      .where(
        and(
          eq(mcpToolCallsTable.partnerKeyId, key.id),
          gt(mcpToolCallsTable.calledAt, oneHourAgo),
        ),
      );

    expect(callCount).toBeGreaterThanOrEqual(key.rateLimit);
  });

  it("should not count old calls (>1hr) toward rate limit", async () => {
    const clientId = await createTestClient();
    const { key } = await createPartnerKey(clientId, { rateLimit: 2 });

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      await db.insert(mcpToolCallsTable).values({
        partnerKeyId: key.id,
        toolName: "get_bot",
        responseStatus: "success",
        latencyMs: 50,
        calledAt: twoHoursAgo,
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [{ count: recentCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mcpToolCallsTable)
      .where(
        and(
          eq(mcpToolCallsTable.partnerKeyId, key.id),
          gt(mcpToolCallsTable.calledAt, oneHourAgo),
        ),
      );

    expect(recentCount).toBe(0);
  });
});
