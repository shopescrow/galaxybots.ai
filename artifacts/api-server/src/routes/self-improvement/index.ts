import type { IRouter } from "express";
import calibrationRouter from "./calibration";
import promptVersionsRouter from "./prompt-versions";
import experimentsRouter from "./experiments";
import alignmentRouter from "./alignment";
import selfImprovementAnalyticsRouter from "./analytics";

export function registerSelfImprovementRoutes(router: IRouter) {
  router.use(calibrationRouter);
  router.use(promptVersionsRouter);
  router.use(experimentsRouter);
  router.use(alignmentRouter);
  router.use(selfImprovementAnalyticsRouter);
}
