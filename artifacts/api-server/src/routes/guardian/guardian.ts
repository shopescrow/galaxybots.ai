import { Router, type IRouter, type Request, type Response } from "express";
import { db, guardianIncidentsTable, guardianWorkersTable, guardianPostmortemsTable, guardianPatrolsTable, guardianStateTable, platformComplianceTable } from "@workspace/db";
import { eq, desc, and, isNull, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate } from "../../middleware/auth";
import { requireQueenControl } from "../../middleware/require-queen-control";
import { classifyThreat, computeErrorFingerprint } from "../../services/guardian/threat-classifier";
import { getQueenState, setQueenMode, runSwarmCycle, getIsSwarmingActive, startQueenSwarmLoop, stopQueenSwarmLoop } from "../../services/guardian/queen-orchestrator";
import { broadcastSSEToAll } from "../../services/platform/sse";
import { aeoScoresTable } from "@workspace/db";

const router: IRouter = Router();

const IngestThreatSchema = z.object({
  domain: z.enum(["code", "security", "ai_safety", "client_health", "performance", "data_integrity", "compliance", "dependency", "predictive", "aeo", "piratemonster"]),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  affectedComponent: z.string().max(200).optional(),
  severity: z.number().min(0).max(100).optional(),
  sourcePayload: z.unknown().optional(),
  kiloProAuditTag: z.string().max(200).optional(),
});

const threatRateMap = new Map<number, number>();
const reporterRateMap = new Map<number, number>();
setInterval(() => { threatRateMap.clear(); reporterRateMap.clear(); }, 60_000);

const BrowserReportSchema = z.object({
  domain: z.enum(["code"]),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  affectedComponent: z.string().max(200).optional(),
  severity: z.number().min(0).max(100).optional(),
  sourcePayload: z.unknown().optional(),
});

router.post("/guardian/report", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const count = (reporterRateMap.get(userId) ?? 0) + 1;
    reporterRateMap.set(userId, count);
    if (count > 10) {
      res.status(429).json({ error: "Rate limit exceeded — max 10 browser error reports per minute" });
      return;
    }

    const parsed = BrowserReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { domain, title, description, affectedComponent, severity: overrideSeverity, sourcePayload } = parsed.data;
    const { severity, blastRadius } = classifyThreat(domain, title, description, overrideSeverity);
    const errorFingerprint = computeErrorFingerprint(domain, title, affectedComponent);

    const [incident] = await db
      .insert(guardianIncidentsTable)
      .values({
        domain,
        title,
        description,
        severity,
        blastRadius,
        status: "open",
        affectedComponent: affectedComponent ?? null,
        errorFingerprint,
        sourcePayload: sourcePayload ? (sourcePayload as Record<string, unknown>) : null,
      })
      .returning();

    runSwarmCycle().catch(() => {});
    res.status(201).json({ incidentId: incident.id, severity, blastRadius, status: "queued" });
  } catch (err) {
    console.error("[Guardian] Browser report ingestion error:", err);
    res.status(500).json({ error: "Failed to ingest browser error report" });
  }
});

router.post("/guardian/threats", authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const role = req.user?.role;
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "Only owner or admin users can ingest guardian threats" });
    return;
  }
  const count = (threatRateMap.get(userId) ?? 0) + 1;
  threatRateMap.set(userId, count);
  if (count > 20) {
    res.status(429).json({ error: "Rate limit exceeded — max 20 threat reports per minute" });
    return;
  }
  try {
    const parsed = IngestThreatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { domain, title, description, affectedComponent, severity: overrideSeverity, sourcePayload, kiloProAuditTag } = parsed.data;
    const { severity, blastRadius } = classifyThreat(domain, title, description, overrideSeverity);
    const errorFingerprint = computeErrorFingerprint(domain, title, affectedComponent);

    const [incident] = await db
      .insert(guardianIncidentsTable)
      .values({
        domain,
        title,
        description,
        severity,
        blastRadius,
        status: "open",
        affectedComponent: affectedComponent ?? null,
        errorFingerprint,
        sourcePayload: sourcePayload ? (sourcePayload as Record<string, unknown>) : null,
        kiloProAuditTag: kiloProAuditTag ?? null,
      })
      .returning();

    broadcastSSEToAll("guardian_threat_ingested", {
      incidentId: incident.id,
      domain,
      severity,
      title,
      at: new Date().toISOString(),
    });

    runSwarmCycle().catch((err) => console.error("[Guardian] Background swarm trigger failed:", err));

    res.status(201).json({ incidentId: incident.id, severity, blastRadius, status: "queued" });
  } catch (err) {
    console.error("[Guardian] Threat ingestion error:", err);
    res.status(500).json({ error: "Failed to ingest threat" });
  }
});

router.get("/guardian/status", authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const { mode, lastSwarmCycleAt } = await getQueenState();

    const [openCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guardianIncidentsTable)
      .where(eq(guardianIncidentsTable.status, "open"));

    const [activeBeeCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guardianWorkersTable)
      .where(eq(guardianWorkersTable.status, "dispatched"));

    const [patrolCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guardianPatrolsTable)
      .where(eq(guardianPatrolsTable.isActive, "active"));

    const [resolvedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guardianIncidentsTable)
      .where(eq(guardianIncidentsTable.status, "resolved"));

    const kiloProStatus = await db
      .select()
      .from(platformComplianceTable)
      .orderBy(desc(platformComplianceTable.createdAt))
      .limit(3);

    const recentAeoScores = await db
      .select()
      .from(aeoScoresTable)
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(5);

    const aeoSummary = recentAeoScores.map((s) => ({
      sourceUrl: s.sourceUrl,
      overallScore: s.overallScore,
      scannedAt: s.scannedAt,
      clientId: s.clientId,
    }));

    const isSwarming = getIsSwarmingActive();
    const queenStatus =
      mode === "paused" ? "Resting" :
      mode === "shutdown" ? "Shutdown" :
      isSwarming ? "Swarming" : "Alive";

    res.json({
      queen: {
        mode,
        status: queenStatus,
        isSwarming,
        lastSwarmCycleAt,
      },
      openThreats: Number(openCount?.count ?? 0),
      activeBees: Number(activeBeeCount?.count ?? 0),
      activePatrols: Number(patrolCount?.count ?? 0),
      totalResolved: Number(resolvedCount?.count ?? 0),
      kiloProCompliance: kiloProStatus,
      pirateMonsterAeo: aeoSummary,
    });
  } catch (err) {
    console.error("[Guardian] Status error:", err);
    res.status(500).json({ error: "Failed to retrieve guardian status" });
  }
});

router.get("/guardian/incidents", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const offset = (page - 1) * limit;
    const domain = req.query.domain as string | undefined;

    const conditions = domain ? [eq(guardianIncidentsTable.domain, domain)] : [];

    const incidents = await db
      .select()
      .from(guardianIncidentsTable)
      .where(conditions.length > 0 ? and(...(conditions as [ReturnType<typeof eq>])) : undefined)
      .orderBy(desc(guardianIncidentsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const incidentIds = incidents.map((i) => i.id);

    const workers = incidentIds.length > 0
      ? await db.select().from(guardianWorkersTable).where(inArray(guardianWorkersTable.incidentId, incidentIds))
      : [];

    const postmortems = incidentIds.length > 0
      ? await db.select().from(guardianPostmortemsTable).where(inArray(guardianPostmortemsTable.incidentId, incidentIds))
      : [];

    const enriched = incidents.map((inc) => ({
      ...inc,
      workers: workers.filter((w) => w.incidentId === inc.id),
      postmortem: postmortems.find((p) => p.incidentId === inc.id) ?? null,
    }));

    res.json({ incidents: enriched, page, limit });
  } catch (err) {
    console.error("[Guardian] Incidents fetch error:", err);
    res.status(500).json({ error: "Failed to retrieve incidents" });
  }
});

router.get("/guardian/postmortems", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const offset = (page - 1) * limit;
    const search = req.query.search as string | undefined;

    const postmortems = await db
      .select()
      .from(guardianPostmortemsTable)
      .orderBy(desc(guardianPostmortemsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const filtered = search
      ? postmortems.filter(
          (p) =>
            p.rootCause.toLowerCase().includes(search.toLowerCase()) ||
            p.triggerEvent.toLowerCase().includes(search.toLowerCase())
        )
      : postmortems;

    res.json({ postmortems: filtered, page, limit });
  } catch (err) {
    console.error("[Guardian] Postmortems fetch error:", err);
    res.status(500).json({ error: "Failed to retrieve post-mortems" });
  }
});

router.get("/guardian/patrols", authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const patrols = await db.select().from(guardianPatrolsTable).orderBy(desc(guardianPatrolsTable.createdAt));
    res.json({ patrols });
  } catch (err) {
    console.error("[Guardian] Patrols fetch error:", err);
    res.status(500).json({ error: "Failed to retrieve patrols" });
  }
});

router.post("/guardian/incidents/:id/dismiss", authenticate, requireQueenControl, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid incident ID" });
      return;
    }

    const [updated] = await db
      .update(guardianIncidentsTable)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(eq(guardianIncidentsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Incident not found" });
      return;
    }

    broadcastSSEToAll("guardian_incident_dismissed", { incidentId: id, at: new Date().toISOString() });
    res.json({ success: true, incidentId: id, status: "dismissed" });
  } catch (err) {
    console.error("[Guardian] Incident dismissal error:", err);
    res.status(500).json({ error: "Failed to dismiss incident" });
  }
});

router.delete("/guardian/patrols/:id", authenticate, requireQueenControl, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid patrol ID" });
      return;
    }

    const [updated] = await db
      .update(guardianPatrolsTable)
      .set({ isActive: "inactive" })
      .where(eq(guardianPatrolsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Patrol not found" });
      return;
    }

    broadcastSSEToAll("guardian_patrol_deleted", { patrolId: id, at: new Date().toISOString() });
    res.json({ success: true, patrolId: id, status: "inactive" });
  } catch (err) {
    console.error("[Guardian] Patrol deletion error:", err);
    res.status(500).json({ error: "Failed to delete patrol" });
  }
});

const ControlSchema = z.object({
  action: z.enum(["pause", "resume", "shutdown", "force_swarm"]),
});

router.post("/guardian/control", authenticate, requireQueenControl, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = ControlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { action } = parsed.data;
    const userId = req.user!.userId;

    if (action === "pause") {
      await setQueenMode("paused", userId);
      res.json({ success: true, mode: "paused" });
    } else if (action === "resume") {
      await setQueenMode("active", userId);
      stopQueenSwarmLoop();
      await startQueenSwarmLoop();
      res.json({ success: true, mode: "active" });
    } else if (action === "shutdown") {
      await setQueenMode("shutdown", userId);
      stopQueenSwarmLoop();
      res.json({ success: true, mode: "shutdown" });
    } else if (action === "force_swarm") {
      await runSwarmCycle();
      res.json({ success: true, action: "swarm_triggered" });
    } else {
      res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    console.error("[Guardian] Control error:", err);
    res.status(500).json({ error: "Control action failed" });
  }
});

export default router;
