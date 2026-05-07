import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestUser, cleanupTestUser, authedAgent, request, type TestUser } from "../../test-utils";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import http from "node:http";
import { mswServer } from "../../test-setup";

const STRIPE_WEBHOOK_SECRET = "whsec_test_smoke_secret";

describe("Billing smoke tests", () => {
  const testUsers: TestUser[] = [];
  let savedStripeKey: string | undefined;
  let stripeServer: http.Server;
  let stripePort: number;

  beforeAll(async () => {
    stripeServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (req.url?.includes("/v1/checkout/sessions")) {
          res.end(JSON.stringify({
            id: "cs_test_smoke_session",
            object: "checkout.session",
            url: "https://checkout.stripe.com/pay/cs_test_smoke_session",
            mode: "subscription",
            metadata: {},
          }));
        } else {
          res.end(JSON.stringify({ id: "obj_test", object: "unknown" }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      stripeServer.listen(0, () => {
        const addr = stripeServer.address();
        stripePort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (savedStripeKey) process.env["STRIPE_SECRET_KEY"] = savedStripeKey;
    delete process.env["STRIPE_API_BASE"];
    await new Promise<void>((resolve) => stripeServer.close(() => resolve()));
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
  });

  it("should return billing status for authenticated user", async () => {
    const user = await createTestUser();
    testUsers.push(user);
    const agent = authedAgent(user.token);

    const res = await agent.get("/api/billing/status");
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeDefined();
    expect(res.body.status).toBeDefined();
  });

  it("should return 503 for stripe checkout when Stripe is not configured", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    savedStripeKey = process.env["STRIPE_SECRET_KEY"];
    delete process.env["STRIPE_SECRET_KEY"];

    const agent = authedAgent(user.token);
    const res = await agent.post("/api/billing/stripe/checkout").send({ plan: "team" });
    expect(res.status).toBe(503);

    process.env["STRIPE_SECRET_KEY"] = savedStripeKey;
  });

  it("should reject checkout with invalid plan name", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const agent = authedAgent(user.token);
    const res = await agent.post("/api/billing/stripe/checkout").send({ plan: "invalid_plan" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("plan must be one of");
  });

  it("should reject checkout with missing plan", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const agent = authedAgent(user.token);
    const res = await agent.post("/api/billing/stripe/checkout").send({});

    expect(res.status).toBe(400);
  });

  it("should create a successful checkout session for a valid plan (Stripe mocked via local server)", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    process.env["STRIPE_API_BASE"] = `http://localhost:${stripePort}`;
    mswServer.close();

    try {
      const agent = authedAgent(user.token);
      const res = await agent.post("/api/billing/stripe/checkout").send({ plan: "team" });

      expect(res.status).toBe(200);
      expect(res.body.url).toBeDefined();
      expect(typeof res.body.url).toBe("string");
      expect(res.body.url).toContain("checkout.stripe.com");
    } finally {
      delete process.env["STRIPE_API_BASE"];
      mswServer.listen({ onUnhandledRequest: "bypass" });
    }
  });

  it("should return public billing plans", async () => {
    const res = await request().get("/api/billing/plans");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should reject webhook with missing stripe-signature header", async () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = STRIPE_WEBHOOK_SECRET;

    const res = await request()
      .post("/api/billing/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify({ type: "checkout.session.completed" })));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing stripe-signature/);
  });

  it("should reject webhook with invalid stripe signature", async () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = STRIPE_WEBHOOK_SECRET;

    const payload = JSON.stringify({ type: "checkout.session.completed" });

    const res = await request()
      .post("/api/billing/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1234567890,v1=invalid_signature")
      .send(Buffer.from(payload));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid signature");
  });

  it("should activate subscription via Stripe webhook with valid signature", async () => {
    const targetUser = await createTestUser();
    testUsers.push(targetUser);

    process.env["STRIPE_WEBHOOK_SECRET"] = STRIPE_WEBHOOK_SECRET;

    const eventPayload = {
      id: "evt_test_smoke",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_smoke",
          object: "checkout.session",
          metadata: {
            clientId: String(targetUser.clientId),
            plan: "team",
          },
        },
      },
    };

    const payloadString = JSON.stringify(eventPayload);
    const timestamp = Math.floor(Date.now() / 1000);
    const stripe = new Stripe("sk_test_fake_key");
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: STRIPE_WEBHOOK_SECRET,
      timestamp,
    });

    const res = await request()
      .post("/api/billing/stripe/webhook")
      .type("application/json")
      .set("stripe-signature", signature)
      .send(payloadString);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const [updatedClient] = await db
      .select({ plan: clientsTable.plan, status: clientsTable.status })
      .from(clientsTable)
      .where(eq(clientsTable.id, targetUser.clientId));

    expect(updatedClient.plan).toBe("team");
    expect(updatedClient.status).toBe("active");
  });
});
