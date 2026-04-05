import { describe, it, expect, afterAll } from "vitest";
import { createTestUser, cleanupTestUser, request, authedAgent, type TestUser } from "../../test-utils";

describe("Auth smoke tests", () => {
  const testUsers: TestUser[] = [];

  afterAll(async () => {
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
  });

  it("should register a new user, login, access /auth/me, and logout", async () => {
    const email = `__smoke_auth_${Date.now()}@test.local`;
    const password = "SmokeTest123!";

    const registerRes = await request()
      .post("/api/auth/register")
      .send({
        email,
        password,
        companyName: `Smoke Auth Co ${Date.now()}`,
        contactName: "Auth Tester",
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user).toBeDefined();
    expect(registerRes.body.user.email).toBe(email.toLowerCase());
    expect(registerRes.body.token).toBeDefined();

    const registeredToken = registerRes.body.token;
    const userId = registerRes.body.user.id;
    const clientId = registerRes.body.user.clientId;
    testUsers.push({
      userId,
      clientId,
      email: email.toLowerCase(),
      token: registeredToken,
      role: "owner",
    });

    const loginRes = await request()
      .post("/api/auth/login")
      .send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.id).toBe(userId);
    expect(loginRes.body.token).toBeDefined();

    const sessionToken = loginRes.body.token;

    const meRes = await authedAgent(sessionToken).get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(email.toLowerCase());
    expect(meRes.body.id).toBe(userId);

    const logoutRes = await authedAgent(sessionToken).post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);
  });

  it("should reject access to protected route without token", async () => {
    const res = await request().get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("should reject login with wrong password", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const res = await request()
      .post("/api/auth/login")
      .send({ email: user.email, password: "WrongPassword!" });

    expect(res.status).toBe(401);
  });

  it("should reject duplicate registration", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const res = await request()
      .post("/api/auth/register")
      .send({
        email: user.email,
        password: "AnotherPass123!",
        companyName: "Duplicate Co",
        contactName: "Dup Tester",
      });

    expect(res.status).toBe(409);
  });
});
