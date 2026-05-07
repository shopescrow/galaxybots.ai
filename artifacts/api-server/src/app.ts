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
  "/api/v1/billing/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

app.post(
  "/api/v1/billing/godaddy/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const { processBillingWebhook } = await import("./services/billing/webhook-handler");
    const sig = req.headers["x-godaddy-signature"] as string | undefined;
    const result = await processBillingWebhook("godaddy", req.body, sig);
    if (result.error) {
      const statusCode = result.error.includes("not configured") ? 503 :
                         result.error.includes("signature") || result.error.includes("Missing") ? 400 :
                         result.error.includes("Database") ? 500 : 400;
      res.status(statusCode).json({ error: result.error });
      return;
    }
    res.json({ received: result.received });
  }
);

app.post(
  "/api/billing/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

app.post(
  "/api/billing/godaddy/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const { processBillingWebhook } = await import("./services/billing/webhook-handler");
    const sig = req.headers["x-godaddy-signature"] as string | undefined;
    const result = await processBillingWebhook("godaddy", req.body, sig);
    if (result.error) {
      const statusCode = result.error.includes("not configured") ? 503 :
                         result.error.includes("signature") || result.error.includes("Missing") ? 400 :
                         result.error.includes("Database") ? 500 : 400;
      res.status(statusCode).json({ error: result.error });
      return;
    }
    res.json({ received: result.received });
  }
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

const PUBLIC_SUFFIXES = [
  "/",
  "/healthz",
  "/auth/register",
  "/auth/login",
  "/auth/logout",
  "/auth/forgot-username",
  "/auth/request-password-reset",
  "/auth/reset-password",
  "/compliance/inbound",
  "/compliance/platform/config",
  "/integrations/piratemonster/webhook",
  "/integrations/piratemonster/register-partner",
  "/prospecting/webhook/piratemonster",
  "/partner/link",
  "/partner/register",
  "/partner/admin/login",
  "/partner/apply",
  "/billing/plans",
  "/billing/addons",
  "/demo/book",
  "/packs",
  "/marketplace",
  "/client-portal/request-pin",
  "/client-portal/verify-pin",
  "/client-portal/me",
  "/client-portal/roi",
  "/client-portal/missions",
  "/client-portal/approvals",
  "/sso/check-domain",
  "/sso/saml/metadata",
  "/sso/exchange",
  "/developer/changelog",
  "/developer/openapi",
  "/developer/webhook-events",
  "/mcp-marketing/social-proof",
  "/mcp-marketing/launch-signup",
  "/mcp-marketing/download-extension",
  "/pdf/health",
  "/data-export",
  "/liberator/stats",
  "/liberator/jobs",
  "/liberator/transforms",
];

const PUBLIC_PREFIX_SUFFIXES = [
  "/partner/",
  "/packs/",
  "/marketplace/",
  "/webhooks/lead/",
  "/webhooks/pipeline/",
  "/storage/public-objects/",
  "/client-portal/missions/",
  "/client-portal/approvals/",
  "/bingolingo/hub/",
  "/bingolingo/ext/",
  "/sso/saml/",
  "/sso/oidc/",
  "/scim/v2/",
  "/liberator/jobs/",
  "/proposals/shared/",
  "/roi/shared/",
];

function buildPublicPaths(prefix: string) {
  return {
    paths: PUBLIC_SUFFIXES.map(s => `${prefix}${s}`),
    prefixes: PUBLIC_PREFIX_SUFFIXES.map(s => `${prefix}${s}`),
  };
}

function createAuthMiddleware(prefix: string) {
  const { paths, prefixes } = buildPublicPaths(prefix);
  return (req: Request, res: Response, next: NextFunction) => {
    const fullPath = `${prefix}${req.path}`;
    if (paths.includes(fullPath) || prefixes.some(p => fullPath.startsWith(p))) {
      return next();
    }
    if (
      (req.method === "POST" && new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/partner\\/[^/]+\\/clients$`).test(fullPath)) ||
      (req.method === "PUT" && new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/partner\\/[^/]+$`).test(fullPath))
    ) {
      return next();
    }
    if (fullPath.startsWith(`${prefix}/analytics/`) && req.headers.authorization?.startsWith("Bearer gba_")) {
      return analyticsApiKeyAuth(req, res, next);
    }
    if (req.headers.authorization?.startsWith("Bearer gbdev_")) {
      return developerApiKeyAuth(req, res, next);
    }
    if (req.headers["x-platform-key"]) {
      return platformApiKeyAuth(req, res, next);
    }
    return authenticate(req, res, next);
  };
}

const SUNSET_DATE = "2026-10-05";

app.use("/api/v1", createAuthMiddleware("/api/v1"));
app.use("/api/v1", instrumentHealthSignals);
app.use("/api/v1", router);

app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/v1")) {
    return next();
  }
  res.set("Deprecation", "true");
  res.set("Sunset", SUNSET_DATE);
  res.set("Link", `</api/v1${req.path}>; rel="successor-version"`);
  next();
});

app.use("/api", createAuthMiddleware("/api"));
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
