import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, extractionJobsTable, crmBlueprintsTable, type CrmBlueprintDef } from "@workspace/db";
import {
  RebuildJobAsCrmParams,
  GetCrmParams,
  UpdateCrmParams,
  UpdateCrmBody,
  DeleteCrmParams,
  CommitCrmParams,
  ListCrmRecordsParams,
  ListCrmRecordsQueryParams,
  CreateCrmRecordParams,
  CreateCrmRecordBody,
  GetCrmRecordParams,
  UpdateCrmRecordParams,
  UpdateCrmRecordBody,
  DeleteCrmRecordParams,
  ExportCrmEntityParams,
  ExportCrmEntityQueryParams,
  ListRelatedRecordsParams,
} from "@workspace/api-zod";
import { inferBlueprintFromRows } from "../../services/liberator/schema-inference";
import {
  listCrms,
  getCrm,
  getEntityCounts,
  updateCrm,
  deleteCrm,
  commitCrm,
  findEntity,
  listRecords,
  getAllRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getRelatedRecords,
  CrmValidationError,
} from "../../services/liberator/crm-store";

const router: IRouter = Router();

function requireUserId(req: Request, res: Response): number | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

router.post("/liberator/jobs/:id/rebuild", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = RebuildJobAsCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [job] = await db.select().from(extractionJobsTable).where(eq(extractionJobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Extraction job not found" });
    return;
  }
  if (job.status !== "completed") {
    res.status(400).json({ error: "Job must be completed before rebuilding as CRM" });
    return;
  }
  const rows = (job.extractedData as Record<string, unknown>[]) ?? [];
  if (rows.length === 0) {
    res.status(400).json({ error: "Job has no extracted rows to rebuild" });
    return;
  }
  const definition = inferBlueprintFromRows(rows, job.name, job.extractionType);
  const [crm] = await db
    .insert(crmBlueprintsTable)
    .values({
      name: `${job.name} CRM`,
      description: `Built from extraction job #${job.id} (${rows.length} rows)`,
      sourceJobId: job.id,
      ownerUserId: userId,
      status: "draft",
      definition,
    })
    .returning();
  res.status(201).json(crm);
});

router.get("/liberator/crms", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const crms = await listCrms(userId);
  res.json(crms);
});

router.get("/liberator/crms/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = GetCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const entityCounts = await getEntityCounts(params.data.id);
  res.json({ crm, entityCounts });
});

router.patch("/liberator/crms/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = UpdateCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCrmBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const updated = await updateCrm(params.data.id, userId, body.data as { name?: string | null; description?: string | null; definition?: CrmBlueprintDef });
    if (!updated) {
      res.status(404).json({ error: "CRM not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof CrmValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete("/liberator/crms/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = DeleteCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const existing = await getCrm(params.data.id, userId);
  if (!existing) {
    res.sendStatus(204);
    return;
  }
  await deleteCrm(params.data.id, userId);
  res.sendStatus(204);
});

router.post("/liberator/crms/:id/commit", async (req: Request, res: Response): Promise<void> => {
  // Deprecated: the synchronous direct commit has been replaced by the
  // job-based data-quality pipeline. This endpoint now returns 410 Gone
  // and points clients at the new pipeline endpoints.
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = CommitCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  res.status(410).json({
    error: "Direct commit is deprecated. Use the data-quality pipeline.",
    pipeline: {
      start: `POST /api/v1/liberator/crms/${params.data.id}/pipeline`,
      status: `GET /api/v1/liberator/crms/${params.data.id}/pipeline`,
      commit: `POST /api/v1/liberator/crms/${params.data.id}/pipeline/commit`,
    },
  });
});

router.get("/liberator/crms/:id/entities/:entity/records", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = ListCrmRecordsParams.safeParse(req.params);
  const query = ListCrmRecordsQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: (params.success ? query : params).error?.message ?? "bad request" });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const ent = findEntity(crm.definition as CrmBlueprintDef, params.data.entity);
  if (!ent) {
    res.status(404).json({ error: "Entity not found in this CRM" });
    return;
  }
  const page = await listRecords(params.data.id, params.data.entity, {
    search: query.data.search ?? null,
    sort: query.data.sort ?? null,
    order: (query.data.order ?? null) as "asc" | "desc" | null,
    limit: query.data.limit ?? null,
    offset: query.data.offset ?? null,
    needsReview: (query.data as { needsReview?: boolean | null }).needsReview ?? null,
  });
  res.json(page);
});

router.post("/liberator/crms/:id/entities/:entity/records", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = CreateCrmRecordParams.safeParse(req.params);
  const body = CreateCrmRecordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message ?? "bad request" });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const ent = findEntity(crm.definition as CrmBlueprintDef, params.data.entity);
  if (!ent) {
    res.status(404).json({ error: "Entity not found in this CRM" });
    return;
  }
  const record = await createRecord(params.data.id, params.data.entity, body.data.data as Record<string, unknown>);
  res.status(201).json(record);
});

router.get("/liberator/crms/:id/entities/:entity/records/:recordId", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = GetCrmRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const r = await getRecord(params.data.id, params.data.recordId);
  if (!r || r.entityType !== params.data.entity) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  res.json(r);
});

router.patch("/liberator/crms/:id/entities/:entity/records/:recordId", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = UpdateCrmRecordParams.safeParse(req.params);
  const body = UpdateCrmRecordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message ?? "bad request" });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const existing = await getRecord(params.data.id, params.data.recordId);
  if (!existing || existing.entityType !== params.data.entity) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  const updated = await updateRecord(params.data.id, params.data.recordId, body.data.data as Record<string, unknown>);
  res.json(updated);
});

router.delete("/liberator/crms/:id/entities/:entity/records/:recordId", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = DeleteCrmRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.sendStatus(204);
    return;
  }
  const existing = await getRecord(params.data.id, params.data.recordId);
  if (!existing || existing.entityType !== params.data.entity) {
    res.sendStatus(204);
    return;
  }
  await deleteRecord(params.data.id, params.data.recordId);
  res.sendStatus(204);
});

router.get(
  "/liberator/crms/:id/entities/:entity/records/:recordId/related",
  async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (userId === null) return;
    const params = ListRelatedRecordsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const crm = await getCrm(params.data.id, userId);
    if (!crm) {
      res.status(404).json({ error: "CRM not found" });
      return;
    }
    const groups = await getRelatedRecords(params.data.id, params.data.entity, params.data.recordId);
    res.json(groups);
  },
);

router.get("/liberator/crms/:id/entities/:entity/export", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = ExportCrmEntityParams.safeParse(req.params);
  const query = ExportCrmEntityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const format = (query.success ? query.data.format : "csv") ?? "csv";
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const ent = findEntity(crm.definition as CrmBlueprintDef, params.data.entity);
  if (!ent) {
    res.status(404).json({ error: "Entity not found in this CRM" });
    return;
  }
  const dataRows = await getAllRecords(params.data.id, params.data.entity);
  const safeName = `${crm.name}-${ent.name}`.replace(/[^a-z0-9._-]+/gi, "_");

  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.json"`);
    res.json(dataRows);
    return;
  }

  const cols = ent.fields.map((f) => f.name);
  const csvRows: string[] = [cols.join(",")];
  for (const row of dataRows) {
    const vals = cols.map((c) => {
      const v = row[c];
      if (v == null) return "";
      const s = typeof v === "string" ? v : JSON.stringify(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    csvRows.push(vals.join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.csv"`);
  res.send(csvRows.join("\n"));
});

import {
  getOrCreateRebuildJob,
  runPipelineToReview,
  getLatestRebuildJobForCrm,
  getRebuildJob,
  updateRecipe,
  updateClusterStatuses,
  updateLinkStatuses,
  commitPipeline,
} from "../../services/liberator/pipeline";
import { TRANSFORM_LIBRARY } from "../../services/liberator/transforms";
import sharp from "sharp";
import { extractionPagesTable, crmRecordsTable } from "@workspace/db";
import { and } from "drizzle-orm";

router.get("/liberator/transforms", async (_req: Request, res: Response): Promise<void> => {
  res.json(TRANSFORM_LIBRARY);
});

// NOTE: there is intentionally no public `/jobs/:jobId/pages/:pageId/screenshot`
// route. Screenshots are sensitive (may contain PII captured by extraction)
// and would be IDOR-enumerable by integer id if exposed standalone. Access is
// scoped through the per-cell thumbnail route below, which requires the
// caller to know a (crmId, entity, recordId, fieldName) tuple — i.e. the
// same scope as reading the CRM record itself.
router.get(
  "/liberator/crms/:id/entities/:entity/records/:recordId/cells/:field/thumb",
  async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req, res);
    if (userId === null) return;
    const crmId = Number(req.params.id);
    const recordId = Number(req.params.recordId);
    const entity = req.params.entity;
    const field = req.params.field;
    if (!Number.isFinite(crmId) || !Number.isFinite(recordId)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const ownedCrm = await getCrm(crmId, userId);
    if (!ownedCrm) {
      res.status(404).json({ error: "CRM not found" });
      return;
    }
    const [rec] = await db
      .select()
      .from(crmRecordsTable)
      .where(and(eq(crmRecordsTable.id, recordId), eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.entityType, entity)));
    if (!rec) {
      res.status(404).json({ error: "record not found" });
      return;
    }
    const prov = rec.provenance ?? ({} as Record<string, unknown>);
    const pageId = (prov as { sourcePageId?: number }).sourcePageId;
    if (!pageId) {
      res.status(404).json({ error: "no source page" });
      return;
    }
    const cellRegion =
      (prov as { regions?: Record<string, { x: number; y: number; w: number; h: number }> }).regions?.[field];
    const rowRegion = (prov as { region?: { x: number; y: number; w: number; h: number } | null }).region ?? null;
    const region = cellRegion ?? rowRegion;
    const [page] = await db
      .select({ b64: extractionPagesTable.screenshotBase64 })
      .from(extractionPagesTable)
      .where(eq(extractionPagesTable.id, pageId));
    if (!page?.b64) {
      res.status(404).json({ error: "screenshot not found" });
      return;
    }
    const src = Buffer.from(page.b64, "base64");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=600");
    if (!region) {
      res.send(src);
      return;
    }
    try {
      const img = sharp(src);
      const meta = await img.metadata();
      const left = Math.max(0, Math.floor(region.x));
      const top = Math.max(0, Math.floor(region.y));
      const width = Math.max(1, Math.min(Math.floor(region.w), (meta.width ?? left + 1) - left));
      const height = Math.max(1, Math.min(Math.floor(region.h), (meta.height ?? top + 1) - top));
      const cropped = await img.extract({ left, top, width, height }).jpeg({ quality: 80 }).toBuffer();
      res.send(cropped);
    } catch {
      res.send(src);
    }
  },
);

router.get("/liberator/crms/:id/pipeline", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = GetCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const job = await getLatestRebuildJobForCrm(params.data.id);
  res.json({ job: job ?? null });
});

router.post("/liberator/crms/:id/pipeline", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = GetCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const jobId = await getOrCreateRebuildJob(params.data.id);
  // Fire and forget — the runner persists progress to the rebuild_jobs row.
  runPipelineToReview(jobId).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[pipeline] background run failed", err);
  });
  const job = await getRebuildJob(jobId);
  res.status(201).json(job);
});

router.patch("/liberator/crms/:id/pipeline/recipe", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = GetCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const recipe = req.body?.recipe;
  if (!recipe || typeof recipe !== "object") {
    res.status(400).json({ error: "recipe is required" });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const job = await getLatestRebuildJobForCrm(params.data.id);
  if (!job) {
    res.status(404).json({ error: "No pipeline run for this CRM yet" });
    return;
  }
  await updateRecipe(job.id, recipe);
  // Re-run normalization through dryrun with the new recipe.
  runPipelineToReview(job.id).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[pipeline] re-run failed", err);
  });
  const updated = await getRebuildJob(job.id);
  res.json(updated);
});

router.patch("/liberator/crms/:id/pipeline/links", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = GetCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const links = req.body?.links;
  if (!Array.isArray(links)) {
    res.status(400).json({ error: "links[] is required" });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const job = await getLatestRebuildJobForCrm(params.data.id);
  if (!job) {
    res.status(404).json({ error: "No pipeline run for this CRM yet" });
    return;
  }
  await updateLinkStatuses(job.id, links);
  const updated = await getRebuildJob(job.id);
  res.json(updated);
});

router.patch("/liberator/crms/:id/pipeline/clusters", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = GetCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const clusters = req.body?.clusters;
  if (!Array.isArray(clusters)) {
    res.status(400).json({ error: "clusters[] is required" });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const job = await getLatestRebuildJobForCrm(params.data.id);
  if (!job) {
    res.status(404).json({ error: "No pipeline run for this CRM yet" });
    return;
  }
  await updateClusterStatuses(job.id, clusters);
  const updated = await getRebuildJob(job.id);
  res.json(updated);
});

router.post("/liberator/crms/:id/pipeline/commit", async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (userId === null) return;
  const params = GetCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id, userId);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const job = await getLatestRebuildJobForCrm(params.data.id);
  if (!job) {
    res.status(404).json({ error: "No pipeline run for this CRM yet" });
    return;
  }
  try {
    const result = await commitPipeline(job.id);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

export function registerCrmRoutes(parent: IRouter): void {
  parent.use(router);
}
