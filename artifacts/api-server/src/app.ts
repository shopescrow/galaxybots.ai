import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import router from "./routes";
import { authenticate } from "./middleware/auth";
import { auditLogger } from "./middleware/audit";
import { generalRateLimit } from "./middleware/rate-limit";
import { stripeWebhookHandler } from "./services/billing/webhook-handler";
import { analyticsApiKeyAuth } from "./middleware/analytics-api-key";
import { instrumentHealthSignals } from "./middleware/health-signals";
import { developerApiKeyAuth } from "./middleware/developer-api-key";
import { platformApiKeyAuth } from "./middleware/platform-api-key";

let shuttingDown = false;

export function setShuttingDown(value: boolean) {
  shuttingDown = value;
}

const app: Express = express();

const requestStartTimes = new WeakMap<Request, [number, number]>();

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = crypto.randomUUID();
  (req as unknown as Record<string, unknown>)["requestId"] = requestId;

  if (shuttingDown) {
    res.status(503).json({ error: "Service Unavailable", message: "Server is shutting down", requestId });
    return;
  }
  requestStartTimes.set(req, process.hrtime());
  next();
});

app.use((_req: Request, res: Response, next: NextFunction) => {
  const req = _req;
  const startTime = requestStartTimes.get(req);
  res.on("finish", () => {
    if (!startTime) return;
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const durationMs = Math.round(seconds * 1000 + nanoseconds / 1_000_000);
    if (durationMs > 500) {
      console.log(
        `[slow-request] ${req.method} ${req.path} ${durationMs}ms status=${res.statusCode}`
      );
    }
  });
  next();
});

const allowedOrigins = process.env["CORS_ORIGINS"]
  ? process.env["CORS_ORIGINS"].split(",").map((s) => s.trim())
  : [];

app.use(
  cors(
    process.env.NODE_ENV === "production"
      ? allowedOrigins.length > 0
        ? {
            origin: allowedOrigins,
            credentials: true,
          }
        : {
            origin: false,
            credentials: true,
          }
      : {
          origin: true,
          credentials: true,
        },
  ),
);

app.post(
  "/api/billing/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

app.use(cookieParser());
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as unknown as Record<string, unknown>)["rawBody"] = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(generalRateLimit);
app.use(auditLogger);

const PUBLIC_PATHS = [
  "/api/",
  "/api/healthz",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/forgot-username",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/compliance/inbound",
  "/api/compliance/platform/config",
  "/api/integrations/piratemonster/webhook",
  "/api/integrations/piratemonster/register-partner",
  "/api/prospecting/webhook/piratemonster",
  "/api/partner/link",
  "/api/partner/register",
  "/api/partner/admin/login",
  "/api/partner/apply",
  "/api/billing/plans",
  "/api/billing/addons",
  "/api/demo/book",
  "/api/packs",
  "/api/marketplace",
  "/api/client-portal/request-pin",
  "/api/client-portal/verify-pin",
  "/api/client-portal/me",
  "/api/client-portal/roi",
  "/api/client-portal/missions",
  "/api/client-portal/approvals",
  "/api/sso/check-domain",
  "/api/sso/saml/metadata",
  "/api/sso/exchange",
  "/api/developer/changelog",
  "/api/developer/openapi",
  "/api/developer/webhook-events",
  "/api/mcp-marketing/social-proof",
  "/api/mcp-marketing/launch-signup",
  "/api/mcp-marketing/download-extension",
  "/api/pdf/health",
];

const PUBLIC_PATH_PREFIXES = [
  "/api/partner/",
  "/api/packs/",
  "/api/marketplace/",
  "/api/webhooks/lead/",
  "/api/webhooks/pipeline/",
  "/api/storage/public-objects/",
  "/api/client-portal/missions/",
  "/api/client-portal/approvals/",
  "/api/bingolingo/hub/",
  "/api/bingolingo/ext/",
  "/api/sso/saml/",
  "/api/sso/oidc/",
  "/api/scim/v2/",
  "/api/proposals/shared/",
  "/api/roi/shared/",
];

app.use("/api", (req, res, next) => {
  const fullPath = `/api${req.path}`;
  if (PUBLIC_PATHS.includes(fullPath) || PUBLIC_PATH_PREFIXES.some(p => fullPath.startsWith(p))) {
    return next();
  }
  if (
    (req.method === "POST" && /^\/api\/partner\/[^/]+\/clients$/.test(fullPath)) ||
    (req.method === "PUT" && /^\/api\/partner\/[^/]+$/.test(fullPath))
  ) {
    return next();
  }
  if (fullPath.startsWith("/api/analytics/") && req.headers.authorization?.startsWith("Bearer gba_")) {
    return analyticsApiKeyAuth(req, res, next);
  }
  if (req.headers.authorization?.startsWith("Bearer gbdev_")) {
    return developerApiKeyAuth(req, res, next);
  }
  if (req.headers["x-platform-key"]) {
    return platformApiKeyAuth(req, res, next);
  }
  return authenticate(req, res, next);
});

app.use("/api", instrumentHealthSignals);
app.use("/api", router);

// Express 5 natively propagates rejected promises from async route handlers
// to the error-handling middleware below, so express-async-errors is not needed.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as unknown as Record<string, unknown>)["requestId"] as string | undefined;
  const user = (req as unknown as Record<string, unknown>)["user"] as { id?: number; clientId?: number } | undefined;

  console.error(
    `[error-handler] ${req.method} ${req.path} requestId=${requestId || "unknown"} userId=${user?.id ?? "anon"} clientId=${user?.clientId ?? "none"} error=${err.message}`,
    err.stack
  );

  const status = (err as unknown as Record<string, unknown>)["status"] as number | undefined ||
    (err as unknown as Record<string, unknown>)["statusCode"] as number | undefined ||
    500;

  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : err.message,
    message: status >= 500 ? "An unexpected error occurred" : err.message,
    requestId: requestId || "unknown",
  });
});

export default app;
