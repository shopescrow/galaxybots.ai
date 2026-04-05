import type { IRouter } from "express";
import authRouter from "./auth";
import ssoRouter from "./sso";
import scimRouter from "./scim";
import oauthRouter from "./oauth";

export function registerAuthRoutes(router: IRouter) {
  router.use(authRouter);
  router.use(ssoRouter);
  router.use(scimRouter);
  router.use(oauthRouter);
}
