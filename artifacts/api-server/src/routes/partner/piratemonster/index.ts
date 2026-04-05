import type { IRouter } from "express";
import webhookAeoRouter from "./webhook-aeo";
import webhookProspectingRouter from "./webhook-prospecting";
import dispatchRouter from "./dispatch";
import recommendationsRouter from "./recommendations";
import competitorsRouter from "./competitors";
import contentAttributionRouter from "./content-attribution";
import mcpKeysRouter from "./mcp-keys";
import healthStatsRouter from "./health-stats";

export { dispatchScanToPirateMonster } from "../../../services/partner/piratemonster-client";

export function registerPirateMonsterRoutes(router: IRouter) {
  router.use(webhookAeoRouter);
  router.use(webhookProspectingRouter);
  router.use(dispatchRouter);
  router.use(recommendationsRouter);
  router.use(competitorsRouter);
  router.use(contentAttributionRouter);
  router.use(mcpKeysRouter);
  router.use(healthStatsRouter);
}
