import express from "express";
import { buildOAuthRouter } from "./oauth.js";
import { buildHealthRoutes } from "./routes/health.js";
import { buildAdminRoutes } from "./routes/admin.js";
import { buildMarketingRoutes } from "./routes/marketing.js";
import { buildToolRoutes } from "./routes/tools.js";
import { buildMcpRoutes } from "./routes/mcp.js";
import { buildLandingRoute } from "./routes/landing.js";

export function createApp(): express.Express {
  const BASE_PATH = (process.env.BASE_PATH || "/__mcp").replace(/\/+$/, "");
  const app = express();

  const CORS_OPEN_PATHS = [
    `${BASE_PATH}/sse`,
    `${BASE_PATH}/messages`,
    "/.well-known/mcp.json",
    `${BASE_PATH}/tools`,
  ];

  app.use((_req, res, next) => {
    const isCorsOpen = CORS_OPEN_PATHS.some(p => _req.path === p || _req.path.startsWith(p));
    if (isCorsOpen) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    }
    if (_req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  });

  app.use(buildHealthRoutes(BASE_PATH));
  app.use(buildToolRoutes(BASE_PATH));
  app.use(buildAdminRoutes(BASE_PATH));
  app.use(buildMarketingRoutes(BASE_PATH));
  app.use(buildMcpRoutes(BASE_PATH));
  app.use(buildLandingRoute(BASE_PATH));

  const oauthRouter = buildOAuthRouter(BASE_PATH);
  app.use(BASE_PATH, oauthRouter);

  return app;
}
