import type { IRouter } from "express";
import orgAdminRouter from "./org-admin";
import userPreferencesRouter from "./user-preferences";
import onboardingRouter from "./onboarding";
import notificationsRouter from "./notifications";
import pushTokensRouter from "./push-tokens";
import storageRouter from "./storage";
import modelCostsRouter from "./model-costs";
import beliefsAdminRouter from "./beliefs";
import ollamaRouter from "./ollama";

export function registerAdminRoutes(router: IRouter) {
  router.use(orgAdminRouter);
  router.use(userPreferencesRouter);
  router.use(onboardingRouter);
  router.use(notificationsRouter);
  router.use(pushTokensRouter);
  router.use(storageRouter);
  router.use(modelCostsRouter);
  router.use(beliefsAdminRouter);
  router.use(ollamaRouter);
}
