import type { IRouter } from "express";
import clientsRouter from "./clients";
import clientIntegrationsRouter from "./client-integrations";
import clientPortalRouter from "./client-portal";
import clientHealthRouter from "./client-health";
import clientStaffRouter from "./client-staff";

export function registerClientRoutes(router: IRouter) {
  router.use(clientsRouter);
  router.use(clientIntegrationsRouter);
  router.use(clientPortalRouter);
  router.use(clientHealthRouter);
  router.use(clientStaffRouter);
}
