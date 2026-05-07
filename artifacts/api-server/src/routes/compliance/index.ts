import type { IRouter } from "express";
import complianceRouter from "./compliance";
import governanceRouter from "./governance";
import auditRouter from "./audit";

export function registerComplianceRoutes(router: IRouter) {
  router.use(complianceRouter);
  router.use(governanceRouter);
  router.use(auditRouter);
}
