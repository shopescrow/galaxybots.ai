import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  runSyncForCrm,
  listSyncRuns,
  getSyncRun,
  listSyncChanges,
  decideChange,
  applyAllPending,
  rejectAllPending,
  rollbackSyncRun,
  reblueprintFromDrift,
  updateSyncConfig,
} from "../../services/liberator/sync-engine";
import { getCrm } from "../../services/liberator/crm-store";
import { db, crmSyncChangesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();

async function assertCrmOwner(req: Request, res: Response, crmId: number): Promise<boolean> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  const crm = await getCrm(crmId, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return false;
  }
  return true;
}

// Assert that (crmId, runId) is a valid pairing AND the user owns crmId.
// Prevents IDOR via cross-CRM run/change ids.
async function assertRunForOwnedCrm(
  req: Request,
  res: Response,
  crmId: number,
  runId: number,
): Promise<boolean> {
  if (!(await assertCrmOwner(req, res, crmId))) return false;
  const run = await getSyncRun(crmId, runId);
  if (!run) {
    res.status(404).json({ error: "Sync run not found" });
    return false;
  }
  return true;
}

// Assert that (crmId, runId, changeId) form a valid chain AND the user owns
// crmId. Prevents IDOR via cross-run change ids.
async function assertChangeForOwnedCrm(
  req: Request,
  res: Response,
  crmId: number,
  runId: number,
  changeId: number,
): Promise<boolean> {
  if (!(await assertRunForOwnedCrm(req, res, crmId, runId))) return false;
  const [change] = await db
    .select({ id: crmSyncChangesTable.id })
    .from(crmSyncChangesTable)
    .where(and(eq(crmSyncChangesTable.id, changeId), eq(crmSyncChangesTable.syncRunId, runId)));
  if (!change) {
    res.status(404).json({ error: "Sync change not found" });
    return false;
  }
  return true;
}

const idParam = z.object({ id: z.coerce.number().int().positive() });
const idRunParam = z.object({
  id: z.coerce.number().int().positive(),
  runId: z.coerce.number().int().positive(),
});
const idRunChangeParam = z.object({
  id: z.coerce.number().int().positive(),
  runId: z.coerce.number().int().positive(),
  changeId: z.coerce.number().int().positive(),
});

const updateSyncConfigBody = z.object({
  enabled: z.boolean().optional().nullable(),
  cadence: z.enum(["manual", "hourly", "daily", "weekly"]).optional().nullable(),
  conflictPolicy: z.enum(["local_wins", "source_wins", "ask"]).optional().nullable(),
  identityFields: z.array(z.string()).optional().nullable(),
});

const decideBody = z.object({
  decision: z.enum(["approved", "rejected"]),
});

const listChangesQuery = z.object({
  changeType: z.enum(["new", "changed", "unchanged", "removed"]).optional().nullable(),
  decision: z.enum(["pending", "approved", "rejected", "auto_applied"]).optional().nullable(),
  limit: z.coerce.number().int().positive().optional().nullable(),
  offset: z.coerce.number().int().min(0).optional().nullable(),
});

const listRunsQuery = z.object({
  limit: z.coerce.number().int().positive().optional().nullable(),
  offset: z.coerce.number().int().min(0).optional().nullable(),
});

router.patch("/liberator/crms/:id/sync-config", async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  const b = updateSyncConfigBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: (p.success ? b : p).error?.message ?? "Invalid request" });
    return;
  }
  if (!(await assertCrmOwner(req, res, p.data.id))) return;
  const updated = await updateSyncConfig(p.data.id, {
    enabled: b.data.enabled ?? undefined,
    cadence: b.data.cadence ?? undefined,
    conflictPolicy: b.data.conflictPolicy ?? undefined,
    identityFields: b.data.identityFields ?? undefined,
  });
  if (!updated) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  res.json(updated);
});

router.post("/liberator/crms/:id/sync", async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  if (!(await assertCrmOwner(req, res, p.data.id))) return;
  try {
    const runId = await runSyncForCrm(p.data.id, { triggeredBy: "manual" });
    if (!runId) {
      res.status(404).json({ error: "CRM not found" });
      return;
    }
    const run = await getSyncRun(p.data.id, runId);
    res.status(202).json(run);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

router.get("/liberator/crms/:id/syncs", async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  const q = listRunsQuery.safeParse(req.query);
  if (!p.success || !q.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (!(await assertCrmOwner(req, res, p.data.id))) return;
  const out = await listSyncRuns(p.data.id, {
    limit: q.data.limit ?? undefined,
    offset: q.data.offset ?? undefined,
  });
  res.json(out);
});

router.get("/liberator/crms/:id/syncs/:runId", async (req: Request, res: Response) => {
  const p = idRunParam.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  if (!(await assertRunForOwnedCrm(req, res, p.data.id, p.data.runId))) return;
  const run = await getSyncRun(p.data.id, p.data.runId);
  if (!run) {
    res.status(404).json({ error: "Sync run not found" });
    return;
  }
  res.json(run);
});

router.get("/liberator/crms/:id/syncs/:runId/changes", async (req: Request, res: Response) => {
  const p = idRunParam.safeParse(req.params);
  const q = listChangesQuery.safeParse(req.query);
  if (!p.success || !q.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (!(await assertRunForOwnedCrm(req, res, p.data.id, p.data.runId))) return;
  const out = await listSyncChanges(p.data.runId, {
    changeType: q.data.changeType ?? null,
    decision: q.data.decision ?? null,
    limit: q.data.limit ?? undefined,
    offset: q.data.offset ?? undefined,
  });
  res.json(out);
});

router.patch(
  "/liberator/crms/:id/syncs/:runId/changes/:changeId",
  async (req: Request, res: Response) => {
    const p = idRunChangeParam.safeParse(req.params);
    const b = decideBody.safeParse(req.body);
    if (!p.success || !b.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    if (!(await assertChangeForOwnedCrm(req, res, p.data.id, p.data.runId, p.data.changeId))) return;
    try {
      await decideChange(p.data.changeId, b.data.decision);
      const out = await listSyncChanges(p.data.runId, { limit: 1, offset: 0 });
      const change = out.changes.find((c) => c.id === p.data.changeId);
      res.json(change ?? { id: p.data.changeId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  },
);

router.post("/liberator/crms/:id/syncs/:runId/apply", async (req: Request, res: Response) => {
  const p = idRunParam.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  if (!(await assertRunForOwnedCrm(req, res, p.data.id, p.data.runId))) return;
  try {
    const result = await applyAllPending(p.data.runId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/liberator/crms/:id/syncs/:runId/reject", async (req: Request, res: Response) => {
  const p = idRunParam.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  if (!(await assertRunForOwnedCrm(req, res, p.data.id, p.data.runId))) return;
  const result = await rejectAllPending(p.data.runId);
  res.json(result);
});

router.post("/liberator/crms/:id/syncs/:runId/rollback", async (req: Request, res: Response) => {
  const p = idRunParam.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  if (!(await assertRunForOwnedCrm(req, res, p.data.id, p.data.runId))) return;
  try {
    const result = await rollbackSyncRun(p.data.runId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/liberator/crms/:id/syncs/:runId/reblueprint", async (req: Request, res: Response) => {
  const p = idRunParam.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await assertRunForOwnedCrm(req, res, p.data.id, p.data.runId))) return;
  try {
    await reblueprintFromDrift(p.data.id, p.data.runId);
    const crm = await getCrm(p.data.id, userId);
    res.json(crm);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export function registerSyncRoutes(parent: IRouter): void {
  parent.use(router);
}

export default router;
