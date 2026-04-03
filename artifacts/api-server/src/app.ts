import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import { authenticate } from "./middleware/auth";
import { auditLogger } from "./middleware/audit";
import { generalRateLimit } from "./middleware/rate-limit";
import { stripeWebhookHandler } from "./routes/billing";
import { analyticsApiKeyAuth } from "./middleware/analytics-api-key";
import { instrumentHealthSignals } from "./middleware/health-signals";
import { developerApiKeyAuth } from "./middleware/developer-api-key";
import { platformApiKeyAuth } from "./middleware/platform-api-key";

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
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as Record<string, unknown>)["rawBody"] = buf;
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

export default app;
