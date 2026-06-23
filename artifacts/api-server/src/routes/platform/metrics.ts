import { Router, type IRouter } from "express";
import { renderPrometheusMetrics } from "../../agent-core/metrics.js";

const router: IRouter = Router();

router.get("/metrics", (_req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheusMetrics());
});

export default router;
