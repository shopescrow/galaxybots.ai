import { Router, type IRouter } from "express";
import { db, pipelineRunsTable, pipelinesTable, personaDivergenceAlertTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import { getCoordinatorStats } from "../../services/coordinator/galaxy-coordinator";
import { getBeliefHealth } from "../../services/intelligence/belief-health";
import { runPersonaDivergenceMonitor, resolveDivergenceAlert } from "../../services/intelligence/persona-divergence-monitor";

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

router.get("/intelligence/belief-health", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    if (!clientId) {
      res.status(400).json({ error: "Client ID required" });
      return;
    }
    const data = await getBeliefHealth(clientId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch belief health" });
  }
});

router.get("/intelligence/persona-divergence/alerts", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const alerts = await db
      .select()
      .from(personaDivergenceAlertTable)
      .where(isNull(personaDivergenceAlertTable.resolvedAt))
      .orderBy(personaDivergenceAlertTable.createdAt);
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch divergence alerts" });
  }
});

router.post("/intelligence/persona-divergence/alerts/:id/resolve", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const alertId = Number(req.params.id);
  if (isNaN(alertId)) {
    res.status(400).json({ error: "Invalid alert ID" });
    return;
  }
  try {
    await resolveDivergenceAlert(alertId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to resolve alert" });
  }
});

router.post("/intelligence/persona-divergence/run", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const result = await runPersonaDivergenceMonitor();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to run divergence monitor" });
  }
});

export default router;
