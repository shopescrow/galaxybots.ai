import type { IRouter } from "express";
import taskSessionsRouter from "./task-sessions";
import workflowsRouter from "./workflows";
import triggersRouter from "./triggers";
import missionTemplatesRouter from "./mission-templates";
import playbooksRouter from "./playbooks";
import briefsRouter from "./briefs";

export function registerMissionRoutes(router: IRouter) {
  router.use(taskSessionsRouter);
  router.use(workflowsRouter);
  router.use(triggersRouter);
  router.use(missionTemplatesRouter);
  router.use(playbooksRouter);
  router.use(briefsRouter);
}
