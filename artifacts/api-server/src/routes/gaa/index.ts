import type { IRouter } from "express";
import gaaRouter from "./gaa";

export function registerGaaRoutes(router: IRouter) {
  router.use(gaaRouter);
}
