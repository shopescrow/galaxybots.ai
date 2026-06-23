import type { IRouter } from "express";
import healthRouter from "./health";
import translateRouter from "./translate";
import demoRouter from "./demo";
import webhooksRouter from "./webhooks";
import developerRouter from "./developer";
import pdfRouter from "./pdf";
import mcpMarketingRouter from "./mcp-marketing";
import pipelinesRouter from "./pipelines";
import metricsRouter from "./metrics";

export function registerPlatformRoutes(router: IRouter) {
  router.use(healthRouter);
  router.use(metricsRouter);
  router.use(translateRouter);
  router.use(demoRouter);
  router.use(webhooksRouter);
  router.use(developerRouter);
  router.use(pdfRouter);
  router.use(mcpMarketingRouter);
  router.use(pipelinesRouter);
}
