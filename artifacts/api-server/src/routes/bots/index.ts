import type { IRouter } from "express";
import botsRouter from "./bots";
import conversationsRouter from "./conversations";
import boardroomRouter from "./boardroom";
import memoryRouter from "./memory";
import voiceIntelligenceRouter from "./voice-intelligence";
import ttsRouter from "./tts";
import receptionistRouter from "./receptionist";
import receptionistWebhooksRouter from "./receptionist-webhooks";
import receptionistLogsRouter from "./receptionist-logs";
import loopConfigRouter from "./loop-config";
import beliefsRouter from "./beliefs";

export function registerBotRoutes(router: IRouter) {
  router.use(botsRouter);
  router.use(conversationsRouter);
  router.use(boardroomRouter);
  router.use(memoryRouter);
  router.use(voiceIntelligenceRouter);
  router.use(ttsRouter);
  router.use(receptionistRouter);
  router.use(receptionistWebhooksRouter);
  router.use(receptionistLogsRouter);
  router.use(loopConfigRouter);
  router.use(beliefsRouter);
}
