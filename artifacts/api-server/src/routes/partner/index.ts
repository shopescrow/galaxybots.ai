import type { IRouter } from "express";
import partnerRouter from "./partner";
import { registerPirateMonsterRoutes } from "./piratemonster/index";
import bingolingoRouter from "./bingolingo";
import bingolingoAnalyticsRouter from "./bingolingo-analytics";
import bingolingoExternalRouter from "./bingolingo-external";

export function registerPartnerRoutes(router: IRouter) {
  router.use(partnerRouter);
  registerPirateMonsterRoutes(router);
  router.use(bingolingoRouter);
  router.use(bingolingoAnalyticsRouter);
  router.use(bingolingoExternalRouter);
}
