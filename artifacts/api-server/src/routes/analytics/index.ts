import type { IRouter } from "express";
import analyticsRouter from "./analytics";
import activityRouter from "./activity";
import roiRouter from "./roi";
import commandCenterRouter from "./command-center";

export function registerAnalyticsRoutes(router: IRouter) {
  router.use(analyticsRouter);
  router.use(activityRouter);
  router.use(roiRouter);
  router.use(commandCenterRouter);
}
