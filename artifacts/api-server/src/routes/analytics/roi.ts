import { Router, type IRouter } from "express";
import { getClientROI, generateWeeklyBriefing, createShareableReport, getShareableReport } from "../../services/analytics/roi";
import { captureSessionOutcome } from "../../services/analytics/outcome-capture";
import { db, sessionOutcomesTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireTenantAccess } from "../../middleware/tenant";
import { sendValidationError, sendParamError } from "../../utils/validation";

const router: IRouter = Router();

router.get("/roi/client/:clientId", requireTenantAccess("clientId"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    sendParamError(res, "Invalid client ID");
    return;
  }

  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

  try {
    const roi = await getClientROI(clientId, dateFrom, dateTo);
    res.json(roi);
  } catch (err) {
    res.status(500).json({ error: "Failed to calculate ROI" });
  }
});

router.get("/roi/client/:clientId/briefing", requireTenantAccess("clientId"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    sendParamError(res, "Invalid client ID");
    return;
  }

  try {
    const briefing = await generateWeeklyBriefing(clientId);
    res.json(briefing);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate briefing" });
  }
});

router.post("/briefings/trigger", async (req, res): Promise<void> => {
  const clientId = Number(req.user?.clientId);
  if (isNaN(clientId) || !clientId) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }

  try {
    const briefing = await generateWeeklyBriefing(clientId);
    res.json(briefing);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate briefing" });
  }
});

router.post("/roi/client/:clientId/shareable", requireTenantAccess("clientId"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    sendParamError(res, "Invalid client ID");
    return;
  }

  const schema = z.object({
    dateFrom: z.string(),
    dateTo: z.string(),
    title: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const report = await createShareableReport(
      clientId,
      new Date(parsed.data.dateFrom),
      new Date(parsed.data.dateTo),
      parsed.data.title
    );
    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ error: "Failed to create shareable report" });
  }
});

router.get("/roi/shared/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  try {
    const report = await getShareableReport(token);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

router.post("/roi/capture-outcome", requireTenantAccess("clientId"), async (req, res): Promise<void> => {
  const schema = z.object({
    sessionId: z.number(),
    objective: z.string(),
    clientId: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const outcome = await captureSessionOutcome(
      parsed.data.sessionId,
      parsed.data.objective,
      parsed.data.clientId
    );
    res.status(201).json(outcome);
  } catch (err) {
    res.status(500).json({ error: "Failed to capture outcome" });
  }
});

router.patch("/roi/client/:clientId/hourly-rate", requireTenantAccess("clientId"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    sendParamError(res, "Invalid client ID");
    return;
  }

  const schema = z.object({ hourlyRate: z.number().min(0) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const [updated] = await db
      .update(clientsTable)
      .set({ hourlyRate: String(parsed.data.hourlyRate) })
      .where(eq(clientsTable.id, clientId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update hourly rate" });
  }
});

export default router;
