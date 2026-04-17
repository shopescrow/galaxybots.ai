import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, extractionJobsTable, extractionPagesTable } from "@workspace/db";
import {
  CreateExtractionJobBody,
  GetExtractionJobParams,
  RunExtractionJobParams,
  DownloadExtractionDataParams,
  DownloadExtractionDataQueryParams,
  PreviewExtractionDataParams,
  DeleteExtractionJobParams,
} from "@workspace/api-zod";
import { runExtractionForJob } from "../../services/liberator/extraction-engine";
import { registerCrmRoutes } from "./crms";
import { registerSyncRoutes } from "./syncs";
import { registerAskRoutes } from "./ask";

const router: IRouter = Router();

router.get("/liberator/jobs", async (_req: Request, res: Response): Promise<void> => {
  const jobs = await db
    .select()
    .from(extractionJobsTable)
    .orderBy(desc(extractionJobsTable.createdAt));
  res.json(jobs);
});

router.post("/liberator/jobs", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateExtractionJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, sourceUrl, extractionType, fields, instructions } = parsed.data;

  const [job] = await db
    .insert(extractionJobsTable)
    .values({
      name,
      sourceUrl,
      extractionType: extractionType ?? "custom",
      fieldMapping: { fields: fields ?? [], instructions: instructions ?? undefined },
    })
    .returning();

  res.status(201).json(job);
});

router.get("/liberator/jobs/:id", async (req: Request, res: Response): Promise<void> => {
  const params = GetExtractionJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(extractionJobsTable)
    .where(eq(extractionJobsTable.id, params.data.id));

  if (!job) {
    res.status(404).json({ error: "Extraction job not found" });
    return;
  }

  const pages = await db
    .select({
      id: extractionPagesTable.id,
      jobId: extractionPagesTable.jobId,
      pageUrl: extractionPagesTable.pageUrl,
      pageNumber: extractionPagesTable.pageNumber,
      status: extractionPagesTable.status,
      extractedRows: extractionPagesTable.extractedRows,
      errorMessage: extractionPagesTable.errorMessage,
      createdAt: extractionPagesTable.createdAt,
    })
    .from(extractionPagesTable)
    .where(eq(extractionPagesTable.jobId, params.data.id))
    .orderBy(extractionPagesTable.pageNumber);

  const fieldMapping = (job.fieldMapping as { fields: string[]; instructions?: string } | null) ?? { fields: [] };

  res.json({
    job,
    pages,
    fieldMapping,
  });
});

router.delete("/liberator/jobs/:id", async (req: Request, res: Response): Promise<void> => {
  const params = DeleteExtractionJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(extractionJobsTable)
    .where(eq(extractionJobsTable.id, params.data.id));

  res.sendStatus(204);
});

router.post("/liberator/jobs/:id/run", async (req: Request, res: Response): Promise<void> => {
  const params = RunExtractionJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(extractionJobsTable)
    .where(eq(extractionJobsTable.id, params.data.id));

  if (!job) {
    res.status(404).json({ error: "Extraction job not found" });
    return;
  }

  runExtractionForJob(params.data.id).catch(() => {});

  const [updated] = await db
    .select()
    .from(extractionJobsTable)
    .where(eq(extractionJobsTable.id, params.data.id));

  res.json(updated);
});

router.get("/liberator/jobs/:id/preview", async (req: Request, res: Response): Promise<void> => {
  const params = PreviewExtractionDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(extractionJobsTable)
    .where(eq(extractionJobsTable.id, params.data.id));

  if (!job) {
    res.status(404).json({ error: "Extraction job not found" });
    return;
  }

  const data = (job.extractedData as Record<string, unknown>[]) ?? [];
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const previewRows = data.slice(0, 50);

  res.json({
    columns,
    rows: previewRows,
    totalRows: data.length,
  });
});

router.get("/liberator/jobs/:id/download", async (req: Request, res: Response): Promise<void> => {
  const params = DownloadExtractionDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const queryParsed = DownloadExtractionDataQueryParams.safeParse(req.query);
  const format = queryParsed.success ? queryParsed.data.format : "csv";

  const [job] = await db
    .select()
    .from(extractionJobsTable)
    .where(eq(extractionJobsTable.id, params.data.id));

  if (!job) {
    res.status(404).json({ error: "Extraction job not found" });
    return;
  }

  const data = (job.extractedData as Record<string, unknown>[]) ?? [];

  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${job.name}-export.json"`);
    res.json(data);
    return;
  }

  if (data.length === 0) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${job.name}-export.csv"`);
    res.send("");
    return;
  }

  const columns = Object.keys(data[0]);
  const csvRows: string[] = [columns.join(",")];

  for (const row of data) {
    const values = columns.map((col) => {
      const val = row[col];
      if (val == null) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(","));
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${job.name}-export.csv"`);
  res.send(csvRows.join("\n"));
});

router.get("/liberator/stats", async (_req: Request, res: Response): Promise<void> => {
  const allJobs = await db
    .select()
    .from(extractionJobsTable)
    .orderBy(desc(extractionJobsTable.createdAt));

  const totalJobs = allJobs.length;
  const completedJobs = allJobs.filter((j) => j.status === "completed").length;
  const totalRowsExtracted = allJobs.reduce((sum, j) => sum + j.rowsExtracted, 0);
  const recentJobs = allJobs.slice(0, 5);

  res.json({
    totalJobs,
    completedJobs,
    totalRowsExtracted,
    recentJobs,
  });
});

export function registerLiberatorRoutes(parent: IRouter): void {
  parent.use(router);
  registerCrmRoutes(parent);
  registerSyncRoutes(parent);
  registerAskRoutes(parent);
}
