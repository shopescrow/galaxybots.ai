import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  clientHealthNotesTable,
  clientHealthEventsTable,
  clientHealthScoresTable,
} from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import {
  computeHealthScore,
  computeAllHealthScores,
  getClientHealthSummary,
  getAllClientHealthScores,
  getHealthAnalytics,
  generateWeeklyPulse,
  recordHealthEvent,
} from "../../services/clients/client-health";

const router: IRouter = Router();

function isPlatformAdmin(req: Express.Request): boolean {
  return req.user?.bypassPayment === true;
}

function enforceClientScope(req: Express.Request, clientId: number): string | null {
  if (isPlatformAdmin(req)) return null;
  if (clientId !== req.user!.clientId) return "Access denied";
  return null;
}

router.get("/client-health", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const scores = await getAllClientHealthScores();
    res.json(scores);
  } catch (err) {
    console.error("Client health list error:", err);
    res.status(500).json({ error: "Failed to fetch client health scores" });
  }
});

router.get("/client-health/analytics", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const analytics = await getHealthAnalytics();
    res.json(analytics);
  } catch (err) {
    console.error("Health analytics error:", err);
    res.status(500).json({ error: "Failed to fetch health analytics" });
  }
});

router.get("/client-health/pulse", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const pulse = await generateWeeklyPulse();
    res.json(pulse);
  } catch (err) {
    console.error("Weekly pulse error:", err);
    res.status(500).json({ error: "Failed to generate weekly pulse" });
  }
});

router.post("/client-health/compute-all", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const results = await computeAllHealthScores();
    res.json({ computed: results.length, results });
  } catch (err) {
    console.error("Compute all health scores error:", err);
    res.status(500).json({ error: "Failed to compute health scores" });
  }
});

router.get("/client-health/:clientId", requireRole("owner", "admin", "member"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const scopeErr = enforceClientScope(req, clientId);
  if (scopeErr) {
    res.status(403).json({ error: scopeErr });
    return;
  }

  try {
    const summary = await getClientHealthSummary(clientId);
    res.json(summary);
  } catch (err) {
    console.error("Client health summary error:", err);
    res.status(500).json({ error: "Failed to fetch client health summary" });
  }
});

router.post("/client-health/:clientId/compute", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const scopeErr = enforceClientScope(req, clientId);
  if (scopeErr) {
    res.status(403).json({ error: scopeErr });
    return;
  }

  try {
    const result = await computeHealthScore(clientId);
    res.json(result);
  } catch (err) {
    console.error("Compute health score error:", err);
    res.status(500).json({ error: "Failed to compute health score" });
  }
});

router.post("/client-health/:clientId/notes", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const scopeErr = enforceClientScope(req, clientId);
  if (scopeErr) {
    res.status(403).json({ error: scopeErr });
    return;
  }

  const noteSchema = z.object({
    note: z.string().min(1),
    tagOverride: z.enum(["healthy", "at_risk", "critical"]).optional().nullable(),
    authorName: z.string().optional(),
  });

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [note] = await db
      .insert(clientHealthNotesTable)
      .values({
        clientId,
        note: parsed.data.note,
        tagOverride: parsed.data.tagOverride || null,
        authorName: parsed.data.authorName || req.user?.email || "Admin",
      })
      .returning();

    res.status(201).json(note);
  } catch (err) {
    console.error("Add health note error:", err);
    res.status(500).json({ error: "Failed to add health note" });
  }
});

router.post("/client-health/:clientId/events", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const scopeErr = enforceClientScope(req, clientId);
  if (scopeErr) {
    res.status(403).json({ error: scopeErr });
    return;
  }

  const eventSchema = z.object({
    signal: z.string().min(1),
    value: z.number().optional().default(1),
    metadata: z.record(z.unknown()).optional().default({}),
  });

  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    await recordHealthEvent(clientId, parsed.data.signal, parsed.data.value, parsed.data.metadata);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("Record health event error:", err);
    res.status(500).json({ error: "Failed to record health event" });
  }
});

export default router;
