import type { IRouter } from "express";
import apiKeysRouter from "./api-keys";
import sessionsRouter from "./sessions";
import botsRouter from "./bots";
import resultsRouter from "./results";
import webhooksRouter from "./webhooks";

export function registerComedyClashRoutes(router: IRouter) {
  router.use(apiKeysRouter);
  router.use(sessionsRouter);
  router.use(botsRouter);
  router.use(resultsRouter);
  router.use(webhooksRouter);
}
