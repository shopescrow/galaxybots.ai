import { Router, type IRouter } from "express";
import { requireRole } from "../../middleware/auth";
import { platformApiKeyAuth } from "../../middleware/platform-api-key";
import { generateIntelligenceReport, getCoordinatorWeightMatrix } from "../../services/intelligence/intelligence-report";
import { runIntelligenceCycle, runPendingRegressionChecks } from "../../services/intelligence/intelligence-cycle";
import { createSplitPolicy, getExperimentResults, checkSignificance } from "../../services/intelligence/ab-experiment";
import { computeAndStoreGlobalPriors } from "../../services/intelligence/global-priors";
import { setClientUcb1Constant } from "../../services/coordinator/galaxy-coordinator";
import { db, conductorStrategiesTable, abExperimentsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/intelligence/report", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const days = Number(req.query.days ?? 30);
    const dateTo = new Date();
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const report = await generateIntelligenceReport(clientId, dateFrom, dateTo);
    res.json(report);
  } catch (err) {
    console.error("[IntelligenceRoutes] /intelligence/report error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate intelligence report" });
  }
});

router.get("/intelligence/coordinator/weights", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const matrix = await getCoordinatorWeightMatrix(clientId);
    res.json(matrix);
  } catch (err) {
    console.error("[IntelligenceRoutes] /intelligence/coordinator/weights error:", err);
    res.status(500).json({ error: "Failed to fetch coordinator weights" });
  }
});

router.get("/intelligence/conductor/strategies", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const days = Number(req.query.days ?? 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        taskCategory: conductorStrategiesTable.taskCategory,
        strategyChosen: conductorStrategiesTable.strategyChosen,
        avgScore: sql<number>`avg(${conductorStrategiesTable.qualityScore})`,
        runCount: sql<number>`count(*)`,
        winCount: sql<number>`count(*) filter (where ${conductorStrategiesTable.qualityScore} >= 0.7)`,
      })
      .from(conductorStrategiesTable)
      .where(
        and(
          eq(conductorStrategiesTable.clientId, clientId),
          sql`${conductorStrategiesTable.createdAt} >= ${since}`,
          sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
        ),
      )
      .groupBy(conductorStrategiesTable.taskCategory, conductorStrategiesTable.strategyChosen)
      .orderBy(desc(sql`avg(${conductorStrategiesTable.qualityScore})`));

    const strategies = rows.map((r) => ({
      taskCategory: r.taskCategory,
      strategy: r.strategyChosen,
      avgScore: Number(r.avgScore ?? 0),
      runCount: Number(r.runCount),
      winRate: Number(r.runCount) > 0 ? Math.round((Number(r.winCount) / Number(r.runCount)) * 100) : 0,
    }));

    res.json({ strategies, daysAnalyzed: days });
  } catch (err) {
    console.error("[IntelligenceRoutes] /intelligence/conductor/strategies error:", err);
    res.status(500).json({ error: "Failed to fetch conductor strategies" });
  }
});

router.post("/intelligence/cycle/trigger", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const days = Number(req.body?.days ?? 7);

    const result = await runIntelligenceCycle(clientId, days, "manual");
    res.json(result);
  } catch (err) {
    console.error("[IntelligenceRoutes] /intelligence/cycle/trigger error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Intelligence cycle failed" });
  }
});

router.post("/intelligence/experiments", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const { splitPct = 50, controlSnapshotId = null, treatmentDescription = "" } = req.body ?? {};

    if (typeof splitPct !== "number" || splitPct < 0 || splitPct > 100) {
      res.status(400).json({ error: "splitPct must be a number between 0 and 100" });
      return;
    }

    const experimentId = await createSplitPolicy(clientId, splitPct, controlSnapshotId, treatmentDescription);
    res.status(201).json({ experimentId, clientId, splitPct, treatmentDescription });
  } catch (err) {
    console.error("[IntelligenceRoutes] POST /intelligence/experiments error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create experiment" });
  }
});

router.get("/intelligence/experiments", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const experiments = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.clientId, clientId))
      .orderBy(desc(abExperimentsTable.createdAt));

    res.json({ experiments });
  } catch (err) {
    console.error("[IntelligenceRoutes] GET /intelligence/experiments error:", err);
    res.status(500).json({ error: "Failed to list experiments" });
  }
});

router.get("/intelligence/experiments/:id/results", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const experimentId = Number(req.params.id);

    if (isNaN(experimentId)) {
      res.status(400).json({ error: "Invalid experiment ID" });
      return;
    }

    const results = await getExperimentResults(experimentId);

    if (!results.experiment) {
      res.status(404).json({ error: "Experiment not found" });
      return;
    }

    if (results.experiment.clientId !== clientId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json(results);
  } catch (err) {
    console.error("[IntelligenceRoutes] GET /intelligence/experiments/:id/results error:", err);
    res.status(500).json({ error: "Failed to get experiment results" });
  }
});

router.post("/intelligence/global-priors/compute", platformApiKeyAuth, requireRole("platform"), async (req, res): Promise<void> => {
  try {
    const { modelVersion } = req.body ?? {};
    await computeAndStoreGlobalPriors(modelVersion);
    res.json({ success: true, message: "Global priors computed successfully" });
  } catch (err) {
    console.error("[IntelligenceRoutes] POST /intelligence/global-priors/compute error:", err);
    res.status(500).json({ error: "Failed to compute global priors" });
  }
});

router.post("/intelligence/regression-checks/run", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  try {
    await runPendingRegressionChecks();
    res.json({ success: true, message: "Pending regression checks processed" });
  } catch (err) {
    console.error("[IntelligenceRoutes] POST /intelligence/regression-checks/run error:", err);
    res.status(500).json({ error: "Failed to run regression checks" });
  }
});

router.put("/intelligence/coordinator/ucb1-constant", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const { constant } = req.body ?? {};
    if (typeof constant !== "number" || constant <= 0) {
      res.status(400).json({ error: "constant must be a positive number" });
      return;
    }
    await setClientUcb1Constant(clientId, constant);
    res.json({ success: true, clientId, constant });
  } catch (err) {
    console.error("[IntelligenceRoutes] PUT /intelligence/coordinator/ucb1-constant error:", err);
    res.status(500).json({ error: "Failed to set UCB1 constant" });
  }
});

export default router;
