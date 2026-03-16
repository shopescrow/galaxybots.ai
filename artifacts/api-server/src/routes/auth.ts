import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, clientsTable, ssoConfigsTable } from "@workspace/db";
import { eq, or, ilike, and } from "drizzle-orm";
import { signToken, authenticate } from "../middleware/auth";
import { authRateLimit } from "../middleware/rate-limit";

const router: IRouter = Router();

router.post("/auth/register", authRateLimit, async (req, res): Promise<void> => {
  const { email, password, companyName, contactName, displayName } = req.body;

  if (!email || !password || !companyName || !contactName) {
    res.status(400).json({ error: "email, password, companyName, and contactName are required" });
    return;
  }

  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (existingUser) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [client] = await db
    .insert(clientsTable)
    .values({
      companyName,
      contactName,
      contactEmail: email.toLowerCase(),
    })
    .returning();

  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      clientId: client.id,
      role: "owner",
      displayName: displayName || contactName,
    })
    .returning();

  const token = signToken({
    userId: user.id,
    clientId: user.clientId,
    role: user.role,
    email: user.email,
    plan: client.plan,
    bypassPayment: user.bypassPayment,
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      clientId: user.clientId,
      role: user.role,
      displayName: user.displayName,
      bypassPayment: user.bypassPayment,
    },
    token,
  });
});

router.post("/auth/login", authRateLimit, async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "email/username and password are required" });
    return;
  }

  const identifier = String(email).trim();
  const isEmail = identifier.includes("@");

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      isEmail
        ? eq(usersTable.email, identifier.toLowerCase())
        : ilike(usersTable.displayName, identifier)
    );

  if (!user) {
    res.status(401).json({ error: "Invalid email, username, or password" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account has been deactivated. Contact your administrator." });
    return;
  }

  const [ssoConfig] = await db
    .select()
    .from(ssoConfigsTable)
    .where(
      and(
        eq(ssoConfigsTable.clientId, user.clientId),
        eq(ssoConfigsTable.enabled, true),
        eq(ssoConfigsTable.forceSso, true),
      ),
    );
  if (ssoConfig) {
    res.status(403).json({ error: "Password login is disabled for your organization. Please use SSO." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, user.clientId));

  const token = signToken({
    userId: user.id,
    clientId: user.clientId,
    role: user.role,
    email: user.email,
    plan: client?.plan,
    bypassPayment: user.bypassPayment,
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      clientId: user.clientId,
      role: user.role,
      displayName: user.displayName,
      bypassPayment: user.bypassPayment,
    },
    token,
  });
});

router.post("/auth/forgot-username", authRateLimit, async (req, res): Promise<void> => {
  const { companyName, contactName } = req.body;

  if (!companyName || !contactName) {
    res.status(400).json({ error: "companyName and contactName are required" });
    return;
  }

  const clients = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.companyName, companyName));

  const matchedClient = clients.find(
    (c) => c.contactName.toLowerCase() === contactName.toLowerCase(),
  );

  if (!matchedClient) {
    res.json({ message: "If a matching account exists, the associated email will be shown.", email: null });
    return;
  }

  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.clientId, matchedClient.id));

  if (!user) {
    res.json({ message: "If a matching account exists, the associated email will be shown.", email: null });
    return;
  }

  const masked = user.email.replace(/^(.{2})(.*)(@.*)$/, (_m, start, middle, domain) => {
    return start + "*".repeat(Math.max(middle.length, 1)) + domain;
  });

  res.json({ message: "Account found.", email: masked });
});

router.post("/auth/request-password-reset", authRateLimit, async (req, res): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (user) {
    const secret = process.env["JWT_SECRET"];
    if (secret) {
      const jwt = await import("jsonwebtoken");
      const resetToken = jwt.default.sign(
        { userId: user.id, purpose: "password_reset" },
        secret,
        { expiresIn: "15m" }
      );
      // TODO: Send resetToken via email delivery service
    }
  }

  res.json({ message: "If an account with that email exists, a password reset link has been sent." });
});

router.post("/auth/reset-password", authRateLimit, async (req, res): Promise<void> => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    res.status(400).json({ error: "token and newPassword are required" });
    return;
  }

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  const jwt = await import("jsonwebtoken");
  let decoded: { userId: number; purpose: string };
  try {
    decoded = jwt.default.verify(token, secret) as { userId: number; purpose: string };
  } catch {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  if (decoded.purpose !== "password_reset") {
    res.status(400).json({ error: "Invalid reset token" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, decoded.userId));

  res.json({ message: "Password has been reset successfully. You can now log in.", success: true });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie("token");
  res.json({ success: true });
});

router.get("/auth/me", authenticate, async (req, res): Promise<void> => {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      clientId: usersTable.clientId,
      role: usersTable.role,
      displayName: usersTable.displayName,
      bypassPayment: usersTable.bypassPayment,
      onboarding: usersTable.onboarding,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [client] = await db
    .select({ plan: clientsTable.plan })
    .from(clientsTable)
    .where(eq(clientsTable.id, user.clientId));

  res.json({ ...user, plan: client?.plan ?? "trial" });
});

export default router;
