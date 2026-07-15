import type { IRouter } from "express";
import taskSessionsRouter from "./task-sessions";
import taskSessionMessagesRouter from "./task-session-messages";
import workflowsRouter from "./workflows";
import triggersRouter from "./triggers";
import missionTemplatesRouter from "./mission-templates";
import playbooksRouter from "./playbooks";
import briefsRouter from "./briefs";
import liveRoomsRouter from "./live-rooms";

export function registerMissionRoutes(router: IRouter) {
  router.use(liveRoomsRouter);
  router.use(taskSessionsRouter);
  router.use(taskSessionMessagesRouter);
  router.use(workflowsRouter);
  router.use(triggersRouter);
  router.use(missionTemplatesRouter);
  router.use(playbooksRouter);
  router.use(briefsRouter);
}
