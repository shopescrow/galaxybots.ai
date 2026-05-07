import type { IRouter } from "express";
import blogRouter from "./blog";
import journalRouter from "./journal";
import documentsRouter from "./documents";
import knowledgeBaseRouter from "./knowledge-base";
import proposalsRouter from "./proposals";

export function registerContentRoutes(router: IRouter) {
  router.use(blogRouter);
  router.use(journalRouter);
  router.use(documentsRouter);
  router.use(knowledgeBaseRouter);
  router.use(proposalsRouter);
}
