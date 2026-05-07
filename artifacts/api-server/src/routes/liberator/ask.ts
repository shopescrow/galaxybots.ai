import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, desc } from "drizzle-orm";
import {
  db,
  crmBlueprintsTable,
  crmSavedViewsTable,
  platformAuditLogTable,
  botsTable,
  type CrmBlueprintDef,
} from "@workspace/db";
import {
  translateNLToDSL,
  validateDSL,
  executeQueryDSL,
  executeMutationDSL,
  previewMutationCount,
  summarizeQueryResult,
  DSLValidationError,
  type DSL,
  type QueryDSL,
  type MutationDSL,
} from "../../services/liberator/nl-query";
import {
  spawnStewardForCrm,
  runAnomalyChecksForCrm,
  listInsightsForCrm,
  getStewardForCrm,
} from "../../services/liberator/steward";

const router: IRouter = Router();

async function loadCrm(id: number, ownerUserId: number): Promise<{ name: string; def: CrmBlueprintDef } | null> {
  const [crm] = await db
    .select()
    .from(crmBlueprintsTable)
    .where(and(eq(crmBlueprintsTable.id, id), eq(crmBlueprintsTable.ownerUserId, ownerUserId)));
  if (!crm) return null;
  return { name: crm.name, def: crm.definition as CrmBlueprintDef };
}

function getUserId(req: Request, res: Response): number | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

function audit(action: string, crmId: number, metadata: Record<string, unknown>, req: Request) {
  db.insert(platformAuditLogTable)
    .values({
      action,
      resource: "liberator_crm",
      resourceId: String(crmId),
      metadata,
      ipAddress: req.ip || req.socket.remoteAddress || "unknown",
    })
    .catch((err) => console.error("[liberator-ask] audit insert failed:", err));
}

/* -------------------- Ask -------------------- */

router.post("/liberator/crms/:id/ask", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  if (!Number.isFinite(crmId)) { res.status(400).json({ error: "invalid id" }); return; }
  const question = String((req.body as Record<string, unknown> | null)?.question ?? "").trim();
  if (!question) { res.status(400).json({ error: "question is required" }); return; }
  if (question.length > 2000) { res.status(400).json({ error: "question too long" }); return; }

  const crm = await loadCrm(crmId, userId);
  if (!crm) { res.status(404).json({ error: "CRM not found" }); return; }

  let dsl: DSL;
  try {
    dsl = await translateNLToDSL(question, crm.def);
  } catch (err) {
    if (err instanceof DSLValidationError) {
      res.status(400).json({ error: "Could not translate question to a safe query", detail: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "translator failed", detail: msg });
    return;
  }

  audit("liberator_ask", crmId, { question, dslKind: dsl.kind }, req);

  if (dsl.kind === "mutation") {
    const matched = await previewMutationCount(crmId, dsl as MutationDSL);
    res.json({
      kind: "mutation",
      dsl,
      requiresConfirm: true,
      matchedCount: matched,
      explanation: `This will affect ${matched} record${matched === 1 ? "" : "s"}. Confirm to apply.`,
    });
    return;
  }

  const payload = await executeQueryDSL(crmId, crm.def, dsl as QueryDSL);
  const summary = await summarizeQueryResult(question, dsl, payload);
  res.json({ kind: "query", dsl, payload: { ...payload, summary } });
});

/* -------------------- Bulk action confirm -------------------- */

router.post("/liberator/crms/:id/ask/execute", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  if (!Number.isFinite(crmId)) { res.status(400).json({ error: "invalid id" }); return; }
  const body = (req.body ?? {}) as { dsl?: unknown; expectedCount?: number };
  const crm = await loadCrm(crmId, userId);
  if (!crm) { res.status(404).json({ error: "CRM not found" }); return; }

  let dsl: DSL;
  try {
    dsl = validateDSL(body.dsl, crm.def);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "invalid dsl" });
    return;
  }
  if (dsl.kind !== "mutation") { res.status(400).json({ error: "only mutation DSL can be executed here" }); return; }

  const actual = await previewMutationCount(crmId, dsl);
  if (typeof body.expectedCount === "number" && body.expectedCount !== actual) {
    res.status(409).json({
      error: "matched count changed since preview — re-run /ask before confirming",
      expected: body.expectedCount,
      actual,
    });
    return;
  }

  const result = await executeMutationDSL(crmId, dsl);
  audit("liberator_bulk_action", crmId, {
    action: dsl.action.op,
    entity: dsl.entity,
    affected: result.affected,
    dsl,
  }, req);
  res.json({ ...result, dsl });
});

/* -------------------- Saved views -------------------- */

router.get("/liberator/crms/:id/views", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  if (!Number.isFinite(crmId)) { res.status(400).json({ error: "invalid id" }); return; }
  const owned = await loadCrm(crmId, userId);
  if (!owned) { res.status(404).json({ error: "CRM not found" }); return; }
  const rows = await db
    .select()
    .from(crmSavedViewsTable)
    .where(eq(crmSavedViewsTable.crmId, crmId))
    .orderBy(desc(crmSavedViewsTable.pinned), desc(crmSavedViewsTable.createdAt));
  res.json(rows);
});

router.post("/liberator/crms/:id/views", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  if (!Number.isFinite(crmId)) { res.status(400).json({ error: "invalid id" }); return; }
  const body = (req.body ?? {}) as { name?: string; question?: string; dsl?: unknown; pinned?: boolean };
  const name = String(body.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const crm = await loadCrm(crmId, userId);
  if (!crm) { res.status(404).json({ error: "CRM not found" }); return; }

  let dsl: DSL;
  try {
    dsl = validateDSL(body.dsl, crm.def);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "invalid dsl" });
    return;
  }
  if (dsl.kind !== "query") { res.status(400).json({ error: "only query DSLs can be saved as views" }); return; }

  const [row] = await db
    .insert(crmSavedViewsTable)
    .values({
      crmId,
      name: name.slice(0, 200),
      question: body.question ?? null,
      // store in the same shape as SavedViewDSL
      dsl: dsl as unknown as Parameters<typeof db.insert>[0] extends never ? never : (typeof crmSavedViewsTable.$inferInsert)["dsl"],
      pinned: !!body.pinned,
    })
    .returning();
  res.status(201).json(row);
});

router.post("/liberator/crms/:id/views/:viewId/run", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  const viewId = Number(req.params.viewId);
  if (!Number.isFinite(crmId) || !Number.isFinite(viewId)) { res.status(400).json({ error: "invalid id" }); return; }
  const crm = await loadCrm(crmId, userId);
  if (!crm) { res.status(404).json({ error: "CRM not found" }); return; }
  const [view] = await db
    .select()
    .from(crmSavedViewsTable)
    .where(and(eq(crmSavedViewsTable.id, viewId), eq(crmSavedViewsTable.crmId, crmId)));
  if (!view) { res.status(404).json({ error: "view not found" }); return; }
  let dsl: DSL;
  try {
    dsl = validateDSL(view.dsl, crm.def);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "saved view is no longer valid" });
    return;
  }
  if (dsl.kind !== "query") { res.status(400).json({ error: "view is not a query" }); return; }
  const payload = await executeQueryDSL(crmId, crm.def, dsl as QueryDSL);
  res.json({ view, payload });
});

router.delete("/liberator/crms/:id/views/:viewId", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  const viewId = Number(req.params.viewId);
  if (!Number.isFinite(crmId) || !Number.isFinite(viewId)) { res.status(400).json({ error: "invalid id" }); return; }
  const owned = await loadCrm(crmId, userId);
  if (!owned) { res.sendStatus(204); return; }
  await db
    .delete(crmSavedViewsTable)
    .where(and(eq(crmSavedViewsTable.id, viewId), eq(crmSavedViewsTable.crmId, crmId)));
  res.sendStatus(204);
});

/* -------------------- Insights + steward -------------------- */

router.get("/liberator/crms/:id/insights", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  if (!Number.isFinite(crmId)) { res.status(400).json({ error: "invalid id" }); return; }
  const owned = await loadCrm(crmId, userId);
  if (!owned) { res.status(404).json({ error: "CRM not found" }); return; }
  const limit = Number(req.query.limit ?? 20);
  const rows = await listInsightsForCrm(crmId, limit);
  res.json(rows);
});

router.post("/liberator/crms/:id/insights/run", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  if (!Number.isFinite(crmId)) { res.status(400).json({ error: "invalid id" }); return; }
  const owned = await loadCrm(crmId, userId);
  if (!owned) { res.status(404).json({ error: "CRM not found" }); return; }
  const found = await runAnomalyChecksForCrm(crmId);
  res.json({ found: found.length, anomalies: found });
});

router.get("/liberator/crms/:id/steward", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  if (!Number.isFinite(crmId)) { res.status(400).json({ error: "invalid id" }); return; }
  const owned = await loadCrm(crmId, userId);
  if (!owned) { res.status(404).json({ error: "CRM not found" }); return; }
  const bot = await getStewardForCrm(crmId);
  res.json({ bot });
});

router.post("/liberator/crms/:id/steward/spawn", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const crmId = Number(req.params.id);
  if (!Number.isFinite(crmId)) { res.status(400).json({ error: "invalid id" }); return; }
  const owned = await loadCrm(crmId, userId);
  if (!owned) { res.status(404).json({ error: "CRM not found" }); return; }
  const bot = await spawnStewardForCrm(crmId);
  if (!bot) { res.status(404).json({ error: "CRM not found" }); return; }
  res.status(201).json(bot);
});

export function registerAskRoutes(parent: IRouter): void {
  parent.use(router);
}

void botsTable; // re-exported elsewhere; suppress unused
