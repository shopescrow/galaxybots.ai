import type { IRouter } from "express";
import intelligenceRouter from "./intelligence";
import demandRouter from "./demand";

export function registerIntelligenceRoutes(router: IRouter) {
  router.use(intelligenceRouter);
  router.use(demandRouter);
}
