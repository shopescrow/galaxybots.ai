import type { IRouter } from "express";
import coordinatorRouter from "./coordinator";

export function registerCoordinatorRoutes(router: IRouter) {
  router.use(coordinatorRouter);
}
