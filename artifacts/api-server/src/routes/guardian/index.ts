import type { IRouter } from "express";
import guardianRouter from "./guardian";

export function registerGuardianRoutes(router: IRouter) {
  router.use(guardianRouter);
}
