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
  CrmValidationError,
} from "../../services/liberator/crm-store";

const router: IRouter = Router();

router.post("/liberator/jobs/:id/rebuild", async (req: Request, res: Response): Promise<void> => {
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
      status: "draft",
      definition,
    })
    .returning();
  res.status(201).json(crm);
});

router.get("/liberator/crms", async (_req: Request, res: Response): Promise<void> => {
  const crms = await listCrms();
  res.json(crms);
});

router.get("/liberator/crms/:id", async (req: Request, res: Response): Promise<void> => {
  const params = GetCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  const entityCounts = await getEntityCounts(params.data.id);
  res.json({ crm, entityCounts });
});

router.patch("/liberator/crms/:id", async (req: Request, res: Response): Promise<void> => {
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
    const updated = await updateCrm(params.data.id, body.data as { name?: string | null; description?: string | null; definition?: CrmBlueprintDef });
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
  const params = DeleteCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await deleteCrm(params.data.id);
  res.sendStatus(204);
});

router.post("/liberator/crms/:id/commit", async (req: Request, res: Response): Promise<void> => {
  const params = CommitCrmParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const crm = await getCrm(params.data.id);
  if (!crm) {
    res.status(404).json({ error: "CRM not found" });
    return;
  }
  let sourceRows: Record<string, unknown>[] = [];
  if (crm.sourceJobId) {
    const [job] = await db
      .select()
      .from(extractionJobsTable)
      .where(eq(extractionJobsTable.id, crm.sourceJobId));
    if (job) {
      sourceRows = (job.extractedData as Record<string, unknown>[]) ?? [];
    }
  }
  const result = await commitCrm(params.data.id, { sourceRows });
  res.json(result);
});

router.get("/liberator/crms/:id/entities/:entity/records", async (req: Request, res: Response): Promise<void> => {
  const params = ListCrmRecordsParams.safeParse(req.params);
  const query = ListCrmRecordsQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: (params.success ? query : params).error?.message ?? "bad request" });
    return;
  }
  const crm = await getCrm(params.data.id);
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
  });
  res.json(page);
});

router.post("/liberator/crms/:id/entities/:entity/records", async (req: Request, res: Response): Promise<void> => {
  const params = CreateCrmRecordParams.safeParse(req.params);
  const body = CreateCrmRecordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message ?? "bad request" });
    return;
  }
  const crm = await getCrm(params.data.id);
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
  const params = GetCrmRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
  const params = UpdateCrmRecordParams.safeParse(req.params);
  const body = UpdateCrmRecordBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message ?? "bad request" });
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
  const params = DeleteCrmRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

router.get("/liberator/crms/:id/entities/:entity/export", async (req: Request, res: Response): Promise<void> => {
  const params = ExportCrmEntityParams.safeParse(req.params);
  const query = ExportCrmEntityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const format = (query.success ? query.data.format : "csv") ?? "csv";
  const crm = await getCrm(params.data.id);
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

export function registerCrmRoutes(parent: IRouter): void {
  parent.use(router);
}
