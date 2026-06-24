import { Router, type IRouter } from "express";
import { requireRole } from "../../middleware/auth";
import { generateIntelligenceReport, getCoordinatorWeightMatrix } from "../../services/intelligence/intelligence-report";
import { runIntelligenceCycle } from "../../services/intelligence/intelligence-cycle";
import { db, conductorStrategiesTable } from "@workspace/db";
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
    const role = req.user!.role;

    const days = Number(req.body?.days ?? 7);

    const result = await runIntelligenceCycle(clientId, days, "manual");
    res.json(result);
  } catch (err) {
    console.error("[IntelligenceRoutes] /intelligence/cycle/trigger error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Intelligence cycle failed" });
  }
});

export default router;
