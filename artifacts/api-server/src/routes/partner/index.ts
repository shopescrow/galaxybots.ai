import type { IRouter } from "express";
import partnerRouter from "./partner";
import piratemonsterRouter from "./piratemonster";
import bingolingoRouter from "./bingolingo";

export function registerPartnerRoutes(router: IRouter) {
  router.use(partnerRouter);
  router.use(piratemonsterRouter);
  router.use(bingolingoRouter);
}
