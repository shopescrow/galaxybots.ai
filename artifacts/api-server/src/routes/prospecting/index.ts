import type { IRouter } from "express";
import prospectsRouter from "./prospects";
import prospectingRouter from "./prospecting";
import prospectingApiRouter from "./prospecting-api";

export function registerProspectingRoutes(router: IRouter) {
  router.use(prospectsRouter);
  router.use(prospectingRouter);
  router.use(prospectingApiRouter);
}
