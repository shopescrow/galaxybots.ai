import { Router, type IRouter } from "express";
import { requireRole } from "../../middleware/auth";
import { getAuditEntries } from "../../services/audit/audit-ledger.js";
import { generateComplianceReport } from "../../services/audit/compliance-report.js";
import { getCircuitMetrics } from "../../services/coordinator/orchestration-circuit-breaker.js";
import type { AuditEngine, AuditDecisionType } from "@workspace/db";

const router: IRouter = Router();

router.get("/v1/audit/ledger", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const limit = Math.min(Number(req.query.limit ?? 100), 1000);
    const offset = Number(req.query.offset ?? 0);
    const format = (req.query.format as string) ?? "json";
    const engine = req.query.engine as AuditEngine | undefined;
    const decisionType = req.query.decision_type as AuditDecisionType | undefined;
    const sessionId = req.query.session_id as string | undefined;
    const after = req.query.after ? new Date(req.query.after as string) : undefined;
    const before = req.query.before ? new Date(req.query.before as string) : undefined;

    const entries = await getAuditEntries({
      clientId,
      limit,
      offset,
      engine,
      decisionType,
      sessionId,
      after,
      before,
    });

    if (format === "csv") {
      const headers = ["id", "client_id", "session_id", "pipeline_run_id", "engine", "decision_type", "payload", "payload_hash", "outcome_quality_score", "created_at"];
      const rows = entries.map((e) => [
        e.id,
        e.clientId ?? "",
        e.sessionId ?? "",
        e.pipelineRunId ?? "",
        e.engine,
        e.decisionType,
        JSON.stringify(e.payload ?? {}),
        e.payloadHash,
        e.outcomeQualityScore ?? "",
        e.createdAt.toISOString(),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-ledger-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send([headers.join(","), ...rows].join("\n"));
      return;
    }

    res.json({
      entries,
      pagination: { limit, offset, count: entries.length },
    });
  } catch (err) {
    console.error("[GalaxyTrustRoutes] /v1/audit/ledger error:", err);
    res.status(500).json({ error: "Failed to fetch audit ledger" });
  }
});

router.get("/v1/audit/compliance-report", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: "month must be in YYYY-MM format" });
      return;
    }

    const report = await generateComplianceReport(month, clientId);
    res.json(report);
  } catch (err) {
    console.error("[GalaxyTrustRoutes] /v1/audit/compliance-report error:", err);
    res.status(500).json({ error: "Failed to generate compliance report" });
  }
});

router.get("/v1/audit/circuit-status", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  const metrics = getCircuitMetrics();
  res.json(metrics);
});

export default router;
