import type { IRouter } from "express";
import billingRouter from "./billing";
import packsRouter from "./packs";
import marketplaceRouter from "./marketplace";

export function registerBillingRoutes(router: IRouter) {
  router.use(billingRouter);
  router.use(packsRouter);
  router.use(marketplaceRouter);
}
