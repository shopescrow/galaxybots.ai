import { Router, type IRouter } from "express";
import { db, pipelineRunsTable, pipelinesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import { getCoordinatorStats } from "../../services/coordinator/galaxy-coordinator";

const router: IRouter = Router();

router.get("/coordinator/stats", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const stats = await getCoordinatorStats(clientId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch coordinator stats" });
  }
});

router.get("/coordinator/runs/:id/trace", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const runId = Number(req.params.id);
  if (isNaN(runId)) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [run] = await db
    .select()
    .from(pipelineRunsTable)
    .where(eq(pipelineRunsTable.id, runId));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, run.pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found or access denied" });
    return;
  }

  if (!run.coordinatorTrace) {
    res.status(404).json({ error: "No coordinator trace available for this run" });
    return;
  }

  res.json({ runId, pipelineId: run.pipelineId, trace: run.coordinatorTrace });
});

export default router;
