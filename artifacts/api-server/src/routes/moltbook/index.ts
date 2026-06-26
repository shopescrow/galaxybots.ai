import type { IRouter } from "express";
import moltbookRouter from "./moltbook";

export function registerMoltbookRoutes(router: IRouter) {
  router.use(moltbookRouter);
}
