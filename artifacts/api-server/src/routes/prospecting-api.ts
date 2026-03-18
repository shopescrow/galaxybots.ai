import { Router, type Request, type Response } from "express";
import { db, prospectingJobsTable, prospectsTable } from "@workspace/db";
import { sql, eq, and, desc, isNotNull } from "drizzle-orm";

const router = Router();

router.get("/prospecting/stats", async (req: Request, res: Response) => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) return res.status(403).json({ error: "Unauthorized" });

    const [stats] = await db
      .select({
        totalJobs: sql<number>`count(distinct ${prospectingJobsTable.id})::int`,
        totalProspects: sql<number>`count(${prospectsTable.id})::int`,
        qualifiedCount: sql<number>`sum(case when ${prospectsTable.status} = 'qualified' then 1 else 0 end)::int`,
        avgConfidence: sql<number>`avg(${prospectsTable.confidenceScore})`,
        totalCost: sql<number>`sum(${prospectsTable.enrichmentCostCredits})`,
        reviewNeeded: sql<number>`sum(case when ${prospectsTable.status} = 'review_needed' then 1 else 0 end)::int`,
      })
      .from(prospectsTable)
      .innerJoin(prospectingJobsTable, eq(prospectsTable.jobId, prospectingJobsTable.id))
      .where(eq(prospectingJobsTable.clientId, clientId));

    const errorBreakdown = await db
      .select({
        category: prospectsTable.errorCategory,
        count: sql<number>`count(*)::int`,
      })
      .from(prospectsTable)
      .where(and(eq(prospectsTable.clientId, clientId), isNotNull(prospectsTable.errorCategory)))
      .groupBy(prospectsTable.errorCategory);

    const patterns = await db.execute(
      sql`SELECT pattern_type, domain_regex, hint_text, times_applied, success_after_hint FROM prospecting_patterns ORDER BY times_applied DESC LIMIT 10`
    );

    res.json({
      ...stats,
      errorBreakdown,
      activePatterns: patterns.rows.length,
      patterns: patterns.rows,
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/prospecting/jobs/:jobId/status", async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const [job] = await db.select().from(prospectingJobsTable).where(eq(prospectingJobsTable.id, jobId));

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const checkpoint = (job.checkpointData as Record<string, unknown>) || {};

    res.json({
      jobId: job.id,
      status: job.status,
      step: checkpoint.step || "initializing",
      progress: checkpoint.progress || 0,
      totalFound: job.totalFound,
      processedCount: job.processedCount,
      totalCostCredits: job.totalCostCredits,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

router.get("/prospecting/prospects", async (req: Request, res: Response) => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) return res.status(403).json({ error: "Unauthorized" });

    const results = await db
      .select()
      .from(prospectsTable)
      .where(eq(prospectsTable.clientId, clientId))
      .orderBy(desc(prospectsTable.createdAt))
      .limit(100);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch prospects" });
  }
});

router.get("/prospecting/jobs", async (req: Request, res: Response) => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) return res.status(403).json({ error: "Unauthorized" });

    const results = await db
      .select()
      .from(prospectingJobsTable)
      .where(eq(prospectingJobsTable.clientId, clientId))
      .orderBy(desc(prospectingJobsTable.createdAt))
      .limit(20);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

export default router;
