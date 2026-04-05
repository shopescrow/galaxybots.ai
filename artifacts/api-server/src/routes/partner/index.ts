import type { IRouter } from "express";
import partnerRouter from "./partner";
import { registerPirateMonsterRoutes } from "./piratemonster/index";
import bingolingoRouter from "./bingolingo";

export function registerPartnerRoutes(router: IRouter) {
  router.use(partnerRouter);
  registerPirateMonsterRoutes(router);
  router.use(bingolingoRouter);
}
