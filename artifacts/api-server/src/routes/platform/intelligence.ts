import { Router, type IRouter } from "express";
import {
  db,
  oracleReportsTable,
  botVariantAssignmentsTable,
  roleGapSignalsTable,
  platformCausalPatternsTable,
  platformAnomaliesTable,
  consequenceRiskScoresTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, gte, sql, ne } from "drizzle-orm";
import { authenticate as requireAuth, requireRole } from "../../middleware/auth.js";

const router: IRouter = Router();

router.get(
  "/platform-intelligence/oracle-reports",
  requireAuth,
  requireRole("owner", "admin"),
  async (_req, res) => {
    try {
      const reports = await db
        .select({
          id: oracleReportsTable.id,
          reportDate: oracleReportsTable.reportDate,
          intelligenceScore: oracleReportsTable.intelligenceScore,
          dimensionScores: oracleReportsTable.dimensionScores,
          reportJson: oracleReportsTable.reportJson,
          modelVersion: oracleReportsTable.modelVersion,
          deliveredPlatform: oracleReportsTable.deliveredPlatform,
          createdAt: oracleReportsTable.createdAt,
        })
        .from(oracleReportsTable)
        .orderBy(desc(oracleReportsTable.reportDate))
        .limit(12);

      res.json(reports);
    } catch (err) {
      console.error("[intelligence] oracle-reports error:", err);
      res.status(500).json({ error: "Failed to fetch Oracle reports" });
    }
  },
);

router.get(
  "/platform-intelligence/oracle-reports/:id",
  requireAuth,
  requireRole("owner", "admin"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params["id"]), 10);
      if (isNaN(id)) { res.status(400).json({ error: "Invalid report ID" }); return; }

      const [report] = await db
        .select()
        .from(oracleReportsTable)
        .where(eq(oracleReportsTable.id, id))
        .limit(1);

      if (!report) { res.status(404).json({ error: "Report not found" }); return; }

      res.json(report);
    } catch (err) {
      console.error("[intelligence] oracle-report detail error:", err);
      res.status(500).json({ error: "Failed to fetch Oracle report" });
    }
  },
);

router.get(
  "/platform-intelligence/champion-configs",
  requireAuth,
  requireRole("owner", "admin"),
  async (_req, res) => {
    try {
      const champions = await db
        .select()
        .from(botVariantAssignmentsTable)
        .where(eq(botVariantAssignmentsTable.status, "champion_declared"))
        .orderBy(desc(botVariantAssignmentsTable.championDeclaredAt))
        .limit(20);

      const active = await db
        .select()
        .from(botVariantAssignmentsTable)
        .where(eq(botVariantAssignmentsTable.status, "active"))
        .orderBy(desc(botVariantAssignmentsTable.updatedAt))
        .limit(20);

      res.json({ champions, active });
    } catch (err) {
      console.error("[intelligence] champion-configs error:", err);
      res.status(500).json({ error: "Failed to fetch bot variant assignments" });
    }
  },
);

router.get(
  "/platform-intelligence/role-gaps",
  requireAuth,
  requireRole("owner", "admin"),
  async (_req, res) => {
    try {
      const gaps = await db
        .select()
        .from(roleGapSignalsTable)
        .where(ne(roleGapSignalsTable.status, "dismissed"))
        .orderBy(desc(roleGapSignalsTable.evidenceSessions))
        .limit(50);

      res.json(gaps);
    } catch (err) {
      console.error("[intelligence] role-gaps error:", err);
      res.status(500).json({ error: "Failed to fetch role gap signals" });
    }
  },
);

router.patch(
  "/platform-intelligence/role-gaps/:id",
  requireAuth,
  requireRole("owner", "admin"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params["id"]), 10);
      if (isNaN(id)) { res.status(400).json({ error: "Invalid gap ID" }); return; }

      const { status, reviewerNote } = req.body as { status?: string; reviewerNote?: string };
      const allowedStatuses = ["pending", "approved", "dismissed"];
      if (status && !allowedStatuses.includes(status)) {
        res.status(400).json({ error: "Invalid status" }); return;
      }

      const updateData: Record<string, unknown> = {};
      if (status) {
        updateData.status = status;
        if (status === "approved") updateData.approvedAt = new Date();
        if (status === "dismissed") updateData.dismissedAt = new Date();
        updateData.reviewedAt = new Date();
      }
      if (reviewerNote !== undefined) updateData.reviewerNote = reviewerNote;

      const [updated] = await db
        .update(roleGapSignalsTable)
        .set(updateData)
        .where(eq(roleGapSignalsTable.id, id))
        .returning();

      if (!updated) { res.status(404).json({ error: "Gap signal not found" }); return; }

      res.json(updated);
    } catch (err) {
      console.error("[intelligence] role-gap patch error:", err);
      res.status(500).json({ error: "Failed to update role gap signal" });
    }
  },
);

router.get(
  "/platform-intelligence/anomalies",
  requireAuth,
  requireRole("owner", "admin"),
  async (_req, res) => {
    try {
      const anomalies = await db
        .select()
        .from(platformAnomaliesTable)
        .orderBy(desc(platformAnomaliesTable.createdAt))
        .limit(100);

      res.json(anomalies);
    } catch (err) {
      console.error("[intelligence] anomalies error:", err);
      res.status(500).json({ error: "Failed to fetch anomalies" });
    }
  },
);

router.patch(
  "/platform-intelligence/anomalies/:id/review",
  requireAuth,
  requireRole("owner", "admin"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params["id"]), 10);
      if (isNaN(id)) { res.status(400).json({ error: "Invalid anomaly ID" }); return; }

      const { quarantineStatus, reviewNote } = req.body as {
        quarantineStatus?: string;
        reviewNote?: string;
      };

      const [updated] = await db
        .update(platformAnomaliesTable)
        .set({
          quarantineStatus: quarantineStatus ?? "reviewed",
          reviewedAt: new Date(),
          reviewNote: reviewNote ?? null,
          resolvedAt: quarantineStatus === "resolved" ? new Date() : undefined,
        })
        .where(eq(platformAnomaliesTable.id, id))
        .returning();

      if (!updated) { res.status(404).json({ error: "Anomaly not found" }); return; }

      if (updated.patternId && quarantineStatus === "resolved") {
        await db
          .update(platformCausalPatternsTable)
          .set({ quarantined: 0 })
          .where(eq(platformCausalPatternsTable.id, updated.patternId));
      }

      res.json(updated);
    } catch (err) {
      console.error("[intelligence] anomaly review error:", err);
      res.status(500).json({ error: "Failed to review anomaly" });
    }
  },
);

router.get(
  "/platform-intelligence/causal-patterns",
  requireAuth,
  requireRole("owner", "admin"),
  async (req, res) => {
    try {
      const vertical = req.query.vertical as string | undefined;
      const conditions = [];
      if (vertical) {
        conditions.push(eq(platformCausalPatternsTable.industryVertical, vertical));
      }

      const patterns = await db
        .select()
        .from(platformCausalPatternsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(platformCausalPatternsTable.confidence))
        .limit(200);

      res.json(patterns);
    } catch (err) {
      console.error("[intelligence] causal-patterns error:", err);
      res.status(500).json({ error: "Failed to fetch causal patterns" });
    }
  },
);

router.get(
  "/platform-intelligence/consequence-risks",
  requireAuth,
  requireRole("owner", "admin"),
  async (_req, res) => {
    try {
      const risks = await db
        .select()
        .from(consequenceRiskScoresTable)
        .orderBy(desc(consequenceRiskScoresTable.riskScore))
        .limit(100);

      res.json(risks);
    } catch (err) {
      console.error("[intelligence] consequence-risks error:", err);
      res.status(500).json({ error: "Failed to fetch consequence risk scores" });
    }
  },
);

router.get(
  "/platform-intelligence/summary",
  requireAuth,
  requireRole("owner", "admin"),
  async (_req, res) => {
    try {
      const [latestReport] = await db
        .select({
          id: oracleReportsTable.id,
          reportDate: oracleReportsTable.reportDate,
          intelligenceScore: oracleReportsTable.intelligenceScore,
          dimensionScores: oracleReportsTable.dimensionScores,
          reportJson: oracleReportsTable.reportJson,
        })
        .from(oracleReportsTable)
        .orderBy(desc(oracleReportsTable.reportDate))
        .limit(1);

      const [activeVariantsRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(botVariantAssignmentsTable)
        .where(eq(botVariantAssignmentsTable.status, "active"));

      const [pendingGapsRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(roleGapSignalsTable)
        .where(eq(roleGapSignalsTable.status, "pending"));

      const [quarantinedRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(platformAnomaliesTable)
        .where(eq(platformAnomaliesTable.quarantineStatus, "quarantined"));

      const [patternsRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(platformCausalPatternsTable)
        .where(eq(platformCausalPatternsTable.quarantined, 0));

      const [highRiskRow] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(consequenceRiskScoresTable)
        .where(gte(consequenceRiskScoresTable.riskScore, 0.7));

      res.json({
        latestReport: latestReport ?? null,
        activeExperiments: activeVariantsRow?.count ?? 0,
        pendingRoleGaps: pendingGapsRow?.count ?? 0,
        quarantinedAnomalies: quarantinedRow?.count ?? 0,
        causalPatterns: patternsRow?.count ?? 0,
        highRiskActions: highRiskRow?.count ?? 0,
      });
    } catch (err) {
      console.error("[intelligence] summary error:", err);
      res.status(500).json({ error: "Failed to fetch platform intelligence summary" });
    }
  },
);

// ── Oracle recommendation → task ─────────────────────────────────────────────
// POST /platform-intelligence/oracle-reports/:reportId/recommendations/:recId/create-task
// Marks a recommendation as "approved_to_task" in reportJson and notifies all owners.
router.post(
  "/platform-intelligence/oracle-reports/:reportId/recommendations/:recId/create-task",
  requireAuth,
  requireRole("owner", "admin"),
  async (req, res) => {
    try {
      const reportId = parseInt(String(req.params["reportId"]), 10);
      const recId = String(req.params["recId"]);
      if (isNaN(reportId)) { res.status(400).json({ error: "Invalid report ID" }); return; }

      const [report] = await db
        .select({ id: oracleReportsTable.id, reportJson: oracleReportsTable.reportJson })
        .from(oracleReportsTable)
        .where(eq(oracleReportsTable.id, reportId))
        .limit(1);

      if (!report) { res.status(404).json({ error: "Report not found" }); return; }

      const reportJson = report.reportJson as {
        recommendations: Array<{ id: string; title: string; description: string; actionType: string; approvedToTaskAt?: string }>;
        [key: string]: unknown;
      };

      const recIndex = reportJson.recommendations?.findIndex((r) => r.id === recId);
      if (recIndex === undefined || recIndex < 0) {
        res.status(404).json({ error: "Recommendation not found" }); return;
      }

      const rec = reportJson.recommendations[recIndex];
      if (!rec) { res.status(404).json({ error: "Recommendation not found" }); return; }

      // Mark the recommendation as approved
      reportJson.recommendations[recIndex] = { ...rec, approvedToTaskAt: new Date().toISOString() };

      await db
        .update(oracleReportsTable)
        .set({ reportJson })
        .where(eq(oracleReportsTable.id, reportId));

      // Create an in-platform notification for all owners so they can track it
      const owners = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, "owner"))
        .limit(10);

      for (const owner of owners) {
        try {
          await db.insert(notificationsTable).values({
            userId: owner.id,
            category: "system",
            severity: "info",
            title: `Task created: ${rec.title}`,
            body: rec.description,
            link: "/platform-intelligence",
            metadata: { oracleReportId: reportId, recommendationId: recId, actionType: rec.actionType },
          });
        } catch {
          // Non-fatal
        }
      }

      res.json({ ok: true, approvedToTaskAt: reportJson.recommendations[recIndex]?.approvedToTaskAt });
    } catch (err) {
      console.error("[intelligence] approve-to-task error:", err);
      res.status(500).json({ error: "Failed to create task from recommendation" });
    }
  },
);

export default router;
