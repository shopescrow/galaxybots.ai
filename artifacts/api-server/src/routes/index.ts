import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botsRouter from "./bots";
import conversationsRouter from "./conversations";
import boardroomRouter from "./boardroom";
import clientsRouter from "./clients";
import journalRouter from "./journal";
import blogRouter from "./blog";
import partnerRouter from "./partner";
import translateRouter from "./translate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botsRouter);
router.use(conversationsRouter);
router.use(boardroomRouter);
router.use(clientsRouter);
router.use(journalRouter);
router.use(blogRouter);
router.use(partnerRouter);
router.use(translateRouter);

export default router;
