import supertest from "supertest";
import { db, usersTable, clientsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signToken } from "./middleware/auth";
import app from "./app";
import type { EventEmitter } from "events";
import http from "http";

const TEST_PREFIX = "__smoke_test_";
let testCounter = 0;

function uniqueEmail(): string {
  testCounter++;
  return `${TEST_PREFIX}user_${Date.now()}_${testCounter}@test.local`;
}

export interface TestUser {
  userId: number;
  clientId: number;
  email: string;
  token: string;
  role: string;
}

export async function createTestUser(
  overrides: { role?: string; companyName?: string } = {},
): Promise<TestUser> {
  const email = uniqueEmail();
  const companyName = overrides.companyName ?? `${TEST_PREFIX}company_${Date.now()}`;
  const passwordHash = await bcrypt.hash("TestPass123!", 4);

  const [client] = await db
    .insert(clientsTable)
    .values({
      companyName,
      contactName: "Smoke Test User",
      contactEmail: email,
    })
    .returning();

  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      clientId: client.id,
      role: overrides.role ?? "owner",
      displayName: "Smoke Test User",
    })
    .returning();

  const token = signToken({
    userId: user.id,
    clientId: client.id,
    role: user.role,
    email: user.email,
    plan: client.plan,
    bypassPayment: user.bypassPayment,
  });

  return {
    userId: user.id,
    clientId: client.id,
    email,
    token,
    role: user.role,
  };
}

export function authedAgent(token: string) {
  return {
    get: (url: string) => supertest(app).get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) =>
      supertest(app).post(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) => supertest(app).put(url).set("Authorization", `Bearer ${token}`),
    delete: (url: string) =>
      supertest(app).delete(url).set("Authorization", `Bearer ${token}`),
  };
}

export function request() {
  return supertest(app);
}

export async function cleanupTestUser(testUser: TestUser): Promise<void> {
  try {
    await db.delete(usersTable).where(eq(usersTable.id, testUser.userId));
    await db.delete(clientsTable).where(eq(clientsTable.id, testUser.clientId));
  } catch (_e) {}
}

export async function cleanupTestUsers(): Promise<void> {
  try {
    const testUsers = await db
      .select({ id: usersTable.id, clientId: usersTable.clientId })
      .from(usersTable)
      .where(sql`${usersTable.email} LIKE ${TEST_PREFIX + "%"}`);

    for (const u of testUsers) {
      await db.delete(usersTable).where(eq(usersTable.id, u.id));
      await db.delete(clientsTable).where(eq(clientsTable.id, u.clientId));
    }
  } catch (_e) {}
}

export interface SSEClientHelper {
  events: Array<{ event?: string; data: string }>;
  close: () => void;
  waitForEvents: (count: number, timeoutMs?: number) => Promise<void>;
}

export function createSSEClient(
  url: string,
  token: string,
  opts: { port?: number } = {},
): SSEClientHelper {
  const events: Array<{ event?: string; data: string }> = [];
  let resolveWait: (() => void) | null = null;
  let targetCount = 0;

  const req = http.request(
    {
      hostname: "localhost",
      port: opts.port,
      path: url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
        Connection: "keep-alive",
      },
    },
    (res) => {
      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split("\n");
          let eventName: string | undefined;
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (data) events.push({ event: eventName, data });
          if (resolveWait && events.length >= targetCount) {
            resolveWait();
            resolveWait = null;
          }
        }
      });
    },
  );

  req.on("error", () => {});
  req.end();

  return {
    events,
    close: () => req.destroy(),
    waitForEvents: (count: number, timeoutMs = 5000) => {
      targetCount = count;
      if (events.length >= count) return Promise.resolve();
      return new Promise<void>((resolve) => {
        resolveWait = resolve;
        setTimeout(() => {
          resolveWait = null;
          resolve();
        }, timeoutMs);
      });
    },
  };
}
