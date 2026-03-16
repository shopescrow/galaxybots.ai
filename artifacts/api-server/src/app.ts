import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import { authenticate } from "./middleware/auth";
import { auditLogger } from "./middleware/audit";
import { generalRateLimit } from "./middleware/rate-limit";
import { stripeWebhookHandler } from "./routes/billing";
import { analyticsApiKeyAuth } from "./middleware/analytics-api-key";

const app: Express = express();

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
app.use(express.json());
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
  "/api/partner/link",
  "/api/partner/register",
  "/api/demo/start",
  "/api/demo/claim",
  "/api/demo/mission-stream",
  "/api/packs",
  "/api/client-portal/request-pin",
  "/api/client-portal/verify-pin",
  "/api/client-portal/me",
  "/api/client-portal/roi",
  "/api/client-portal/missions",
  "/api/client-portal/approvals",
];

const PUBLIC_PATH_PREFIXES = [
  "/api/packs/",
  "/api/webhooks/lead/",
  "/api/webhooks/pipeline/",
  "/api/storage/public-objects/",
  "/api/client-portal/missions/",
  "/api/client-portal/approvals/",
];

app.use("/api", (req, res, next) => {
  const fullPath = `/api${req.path}`;
  if (PUBLIC_PATHS.includes(fullPath) || PUBLIC_PATH_PREFIXES.some(p => fullPath.startsWith(p))) {
    return next();
  }
  if (fullPath.startsWith("/api/analytics/") && req.headers.authorization?.startsWith("Bearer gba_")) {
    return analyticsApiKeyAuth(req, res, next);
  }
  return authenticate(req, res, next);
});

app.use("/api", router);

export default app;
