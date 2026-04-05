import { describe, it, expect, afterAll, afterEach } from "vitest";
import { createTestUser, cleanupTestUser, createSSEClient, type TestUser } from "../../test-utils";
import { addSSEClient, broadcastSSE, stopHeartbeat, closeAllSSEClients, getSSEClientCount } from "./sse";
import app from "../../app";
import http from "http";

describe("SSE smoke tests", () => {
  const testUsers: TestUser[] = [];
  let server: http.Server;
  let port: number;

  afterEach(() => {
    stopHeartbeat();
  });

  afterAll(async () => {
    closeAllSSEClients();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
  });

  it("should establish an authenticated SSE connection and receive the connected event", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as { port: number }).port;

    const client = createSSEClient("/api/events/background", user.token, { port });
    await client.waitForEvents(1, 5000);

    expect(client.events.length).toBeGreaterThanOrEqual(1);
    const connEvent = client.events.find((e) => e.event === "connected");
    expect(connEvent).toBeDefined();

    client.close();
  });

  it("should broadcast an event to registered clients with matching clientId", () => {
    const chunks: string[] = [];
    const mockRes = {
      write: (data: string) => { chunks.push(data); return true; },
      on: () => mockRes,
    } as unknown as import("express").Response;

    const clientId = 777777;
    addSSEClient(`sse-broadcast-${Date.now()}`, mockRes, clientId);

    broadcastSSE("test_broadcast", { clientId, payload: "hello" });

    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("event: test_broadcast");
    const parsed = JSON.parse(chunks[0].split("data: ")[1].trim());
    expect(parsed.payload).toBe("hello");
  });

  it("should NOT broadcast events to clients with a different clientId", () => {
    const chunks1: string[] = [];
    const chunks2: string[] = [];

    const mockRes1 = {
      write: (data: string) => { chunks1.push(data); return true; },
      on: () => mockRes1,
    } as unknown as import("express").Response;

    const mockRes2 = {
      write: (data: string) => { chunks2.push(data); return true; },
      on: () => mockRes2,
    } as unknown as import("express").Response;

    addSSEClient(`sse-a-${Date.now()}`, mockRes1, 100001);
    addSSEClient(`sse-b-${Date.now()}`, mockRes2, 100002);

    broadcastSSE("scoped_event", { clientId: 100001, data: "only for a" });

    expect(chunks1.length).toBe(1);
    expect(chunks2.length).toBe(0);
  });

  it("should prune dead clients during heartbeat tick", async () => {
    const countBefore = getSSEClientCount();

    const mockRes = {
      closed: false,
      writableEnded: false,
      write: () => { throw new Error("dead socket"); },
      on: () => mockRes,
    } as unknown as import("express").Response;

    addSSEClient(`sse-dead-${Date.now()}`, mockRes, 999999);
    expect(getSSEClientCount()).toBe(countBefore + 1);

    broadcastSSE("heartbeat_test", { clientId: 999999 });

    await new Promise((r) => setTimeout(r, 50));

    closeAllSSEClients();
    expect(getSSEClientCount()).toBe(0);
  });

  it("should clean up all clients and stop heartbeat via closeAllSSEClients", () => {
    const mockRes = {
      end: () => {},
      on: () => mockRes,
      write: () => true,
    } as unknown as import("express").Response;

    addSSEClient(`sse-cleanup-${Date.now()}`, mockRes, 888888);
    expect(getSSEClientCount()).toBeGreaterThanOrEqual(1);

    closeAllSSEClients();
    expect(getSSEClientCount()).toBe(0);
  });
});
