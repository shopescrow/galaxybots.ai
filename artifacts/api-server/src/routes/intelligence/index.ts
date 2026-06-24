import type { IRouter } from "express";
import intelligenceRouter from "./intelligence";

export function registerIntelligenceRoutes(router: IRouter) {
  router.use(intelligenceRouter);
}
