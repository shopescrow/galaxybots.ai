import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { pool, usersTable, clientsTable, ssoConfigsTable, withBypassRLS } from "@workspace/db";
import { eq, or, ilike, and } from "drizzle-orm";
import { signToken, authenticate } from "../../middleware/auth";
import { recordLoginSignal } from "../../middleware/health-signals";
import { authRateLimit } from "../../middleware/rate-limit";
import { sendValidationError } from "../../utils/validation";
import { checkWorkflowTriggers, seedBuiltInWorkflows } from "../../services/missions/workflow-engine";
import { z } from "zod";

const router: IRouter = Router();

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  displayName: z.string().optional(),
});

const LoginBody = z.object({
  email: z.string().min(1, "email/username is required"),
  password: z.string().min(1, "password is required"),
});

const ForgotUsernameBody = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
});

const RequestPasswordResetBody = z.object({
  email: z.string().email(),
});

const ResetPasswordBody = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// ── /auth/register ────────────────────────────────────────────────────────────
// Public route — no ALS tenant context. All DB calls use withBypassRLS so that
// FORCE RLS does not deny the INSERT into clients/users or the duplicate-check
// SELECT. The bypass is narrowly scoped to each individual query here.
router.post("/auth/register", authRateLimit, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { email, password, companyName, contactName, displayName } = parsed.data;

  const [existingUser] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase())),
  );

  if (existingUser) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [client] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .insert(clientsTable)
      .values({
        companyName,
        contactName,
        contactEmail: email.toLowerCase(),
      })
      .returning(),
  );

  const [user] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .insert(usersTable)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        clientId: client.id,
        role: "owner",
        displayName: displayName || contactName,
      })
      .returning(),
  );

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
    path: "/",
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

  seedBuiltInWorkflows(client.id)
    .then(() =>
      checkWorkflowTriggers("new_client_created", {
        clientId: client.id,
        companyName: client.companyName,
        contactName: client.contactName,
        contactEmail: client.contactEmail,
      }, client.id)
    )
    .catch((e) => console.error("[auth] Failed to seed workflows or trigger new_client_created:", e));
});

// ── /auth/login ───────────────────────────────────────────────────────────────
router.post("/auth/login", authRateLimit, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { email, password } = parsed.data;

  const identifier = String(email).trim();
  const isEmail = identifier.includes("@");

  const [user] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select()
      .from(usersTable)
      .where(
        isEmail
          ? eq(usersTable.email, identifier.toLowerCase())
          : ilike(usersTable.displayName, identifier),
      ),
  );

  if (!user) {
    res.status(401).json({ error: "Invalid email, username, or password" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account has been deactivated. Contact your administrator." });
    return;
  }

  const [ssoConfig] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select()
      .from(ssoConfigsTable)
      .where(
        and(
          eq(ssoConfigsTable.clientId, user.clientId),
          eq(ssoConfigsTable.enabled, true),
          eq(ssoConfigsTable.forceSso, true),
        ),
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

  await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id)),
  );

  const [client] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)),
  );

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
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  recordLoginSignal(user.clientId);

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

// ── /auth/forgot-username ─────────────────────────────────────────────────────
router.post("/auth/forgot-username", authRateLimit, async (req, res): Promise<void> => {
  const parsed = ForgotUsernameBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { companyName, contactName } = parsed.data;

  const clients = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.companyName, companyName)),
  );

  const matchedClient = clients.find(
    (c) => c.contactName.toLowerCase() === contactName.toLowerCase(),
  );

  if (!matchedClient) {
    res.json({ message: "If a matching account exists, the associated email will be shown.", email: null });
    return;
  }

  const [user] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.clientId, matchedClient.id)),
  );

  if (!user) {
    res.json({ message: "If a matching account exists, the associated email will be shown.", email: null });
    return;
  }

  const masked = user.email.replace(/^(.{2})(.*)(@.*)$/, (_m, start, middle, domain) => {
    return start + "*".repeat(Math.max(middle.length, 1)) + domain;
  });

  res.json({ message: "Account found.", email: masked });
});

// ── /auth/request-password-reset ──────────────────────────────────────────────
router.post("/auth/request-password-reset", authRateLimit, async (req, res): Promise<void> => {
  const parsed = RequestPasswordResetBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { email } = parsed.data;

  const [user] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase())),
  );

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

// ── /auth/reset-password ──────────────────────────────────────────────────────
router.post("/auth/reset-password", authRateLimit, async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { token, newPassword } = parsed.data;

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
  await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, decoded.userId)),
  );

  res.json({ message: "Password has been reset successfully. You can now log in.", success: true });
});

// ── /auth/logout (authenticated — ALS context set by attachTenantDbContext) ───
router.post("/auth/logout", authenticate, async (req, res): Promise<void> => {
  const email = req.user!.email;

  const { revokeUserSessions } = await import("./sso");

  revokeUserSessions(email);
  res.clearCookie("token", { path: "/" });

  const [user] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select({ ssoProvider: usersTable.ssoProvider, clientId: usersTable.clientId })
      .from(usersTable)
      .where(eq(usersTable.email, email)),
  );

  let idpLogoutUrl: string | null = null;
  if (user?.ssoProvider === "saml") {
    const [config] = await withBypassRLS(pool, (bypassDb) =>
      bypassDb
        .select()
        .from(ssoConfigsTable)
        .where(
          and(
            eq(ssoConfigsTable.clientId, user.clientId),
            eq(ssoConfigsTable.providerType, "saml"),
          ),
        ),
    );
    if (config?.idpSsoUrl) {
      const sloUrl = config.idpSsoUrl.replace(/\/sso\//, "/slo/").replace(/SSO/, "SLO");
      if (sloUrl !== config.idpSsoUrl) {
        idpLogoutUrl = sloUrl;
      }
    }
  }

  res.json({ success: true, idpLogoutUrl });
});

// ── /auth/me (authenticated — ALS context set by attachTenantDbContext) ───────
router.get("/auth/me", authenticate, async (req, res): Promise<void> => {
  const [user] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
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
      .where(eq(usersTable.id, req.user!.userId)),
  );

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [client] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select({ plan: clientsTable.plan })
      .from(clientsTable)
      .where(eq(clientsTable.id, user.clientId)),
  );

  res.json({ ...user, plan: client?.plan ?? "trial" });
});

export default router;
