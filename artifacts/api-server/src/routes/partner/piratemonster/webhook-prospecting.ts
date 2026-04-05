import { Router, type IRouter, type Request, type Response } from "express";
import { db, prospectsTable, platformAuditLogTable, confidenceConfigsTable, prospectingJobsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { scoreConfidence } from "../../prospecting/prospecting";
import { requireInboundSecret, PIRATEMONSTER_API_KEY, PIRATEMONSTER_API_BASE_URL } from "./_shared";

const router: IRouter = Router();

const PirateMonsterProspectSchema = z.object({
  companyName: z.string(),
  domain: z.string(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  socialLinks: z.record(z.string(), z.string().url()).optional().nullable(),
});

const PirateMonsterBatchWebhookSchema = z.object({
  clientId: z.number(),
  jobId: z.number().optional(),
  prospects: z.array(PirateMonsterProspectSchema),
});

router.post("/prospecting/webhook/piratemonster", (req, res, next) => requireInboundSecret(req, res, next), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = PirateMonsterBatchWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid batch payload", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { clientId, jobId, prospects } = parsed.data;

    const [config] = await db.select().from(confidenceConfigsTable).where(eq(confidenceConfigsTable.clientId, clientId));
    const defaultWeights = { emailWeight: "0.25", phoneWeight: "0.25", domainWeight: "0.20", socialWeight: "0.15", nameWeight: "0.15" };
    
    let inserted = 0;
    let reviewQueued = 0;

    const valuesToInsert = prospects.map(p => {
      const confidence = scoreConfidence(p, config || defaultWeights);
      const status = confidence.score < 0.70 ? "review_needed" : "enriched";
      if (status === "review_needed") reviewQueued++;
      else inserted++;

      return {
        clientId,
        jobId: jobId || null,
        companyName: p.companyName,
        domain: p.domain,
        sourceUrl: p.domain.startsWith("http") ? p.domain : `https://${p.domain}`,
        email: p.email,
        phone: p.phone,
        socialLinks: p.socialLinks,
        status: status as "enriched" | "review_needed",
        confidenceScore: confidence.score,
        updatedAt: new Date(),
      };
    });

    if (valuesToInsert.length > 0) {
      await db.insert(prospectsTable).values(valuesToInsert);

      await db.insert(platformAuditLogTable).values({
        clientId,
        action: "piratemonster_webhook_batch",
        resource: "prospect",
        metadata: {
          compliancePlatform: "kilopro",
          jobId,
          count: prospects.length,
          inserted,
          reviewQueued
        }
      });
    }

    res.json({ inserted, reviewQueued });
  } catch (err) {
    console.error("PirateMonster prospecting webhook error:", err);
    res.status(500).json({ error: "Failed to process prospecting webhook" });
  }
});

router.post("/prospecting/jobs/dispatch", async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.user?.clientId;
    if (!clientId) {
      res.status(403).json({ error: "Client context required" });
      return;
    }

    const idempotencyKey = req.headers["idempotency-key"] as string;
    if (!idempotencyKey) {
      res.status(400).json({ error: "Idempotency-Key header required" });
      return;
    }

    const [existingJob] = await db.select().from(prospectingJobsTable).where(and(eq(prospectingJobsTable.clientId, clientId), eq(prospectingJobsTable.idempotencyKey, idempotencyKey)));
    if (existingJob) {
      res.json(existingJob);
      return;
    }

    if (!PIRATEMONSTER_API_KEY) {
      res.status(503).json({ error: "PirateMonster API key not configured" });
      return;
    }

    const [job] = await db.insert(prospectingJobsTable).values({
      clientId,
      query: req.body.query,
      location: req.body.location,
      limit: req.body.limit || 50,
      status: "pending",
      idempotencyKey,
      source: "piratemonster",
      requestedBy: req.user?.userId ? req.user.userId.toString() : "user"
    } as typeof prospectingJobsTable.$inferInsert).returning();

    await db.insert(platformAuditLogTable).values({
      clientId,
      userId: req.user?.userId || null,
      action: "prospecting_job_dispatch",
      resource: "prospecting_job",
      resourceId: job.id.toString(),
      metadata: {
        compliancePlatform: "kilopro",
        source: "piratemonster",
        query: req.body.query
      }
    });

    if (!PIRATEMONSTER_API_BASE_URL) {
      await db.update(prospectingJobsTable).set({ status: "failed" }).where(eq(prospectingJobsTable.id, job.id));
      res.status(503).json({ error: "PirateMonster API base URL not configured. Set PIRATEMONSTER_API_BASE_URL to enable prospecting dispatch." });
      return;
    }

    try {
      const pmResponse = await fetch(`${PIRATEMONSTER_API_BASE_URL}/v1/enterprise/prospecting/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${PIRATEMONSTER_API_KEY}`,
        },
        body: JSON.stringify({
          query: req.body.query,
          location: req.body.location,
          limit: req.body.limit || 50,
          webhook_callback: process.env["GALAXYBOTS_API_URL"]
            ? `${process.env["GALAXYBOTS_API_URL"]}/api/prospecting/webhook/piratemonster`
            : process.env["REPLIT_DEV_DOMAIN"]
            ? `https://${process.env["REPLIT_DEV_DOMAIN"]}/api/prospecting/webhook/piratemonster`
            : `/api/prospecting/webhook/piratemonster`,
          client_id: clientId,
          idempotency_key: idempotencyKey,
        }),
      });

      if (pmResponse.ok) {
        const pmData = await pmResponse.json() as { id?: number | string; job_id?: number | string };
        const pmJobId = pmData.id != null ? String(pmData.id) : pmData.job_id != null ? String(pmData.job_id) : null;
        await db.execute(
          sql`UPDATE prospecting_jobs SET status = 'submitted', pm_job_id = ${pmJobId} WHERE id = ${job.id}`
        );
        console.log(`[PM] Prospecting job ${job.id} submitted to PirateMonster (pmJobId: ${pmJobId ?? "unknown"})`);
      } else {
        const errText = await pmResponse.text();
        console.error(`[PM] Prospecting job dispatch failed: HTTP ${pmResponse.status} — ${errText}`);
        await db.update(prospectingJobsTable).set({ status: "failed" }).where(eq(prospectingJobsTable.id, job.id));
        res.status(502).json({ error: `PirateMonster returned HTTP ${pmResponse.status}. Job recorded locally.` });
        return;
      }
    } catch (pmErr) {
      console.error("[PM] Prospecting job dispatch error:", pmErr);
      await db.update(prospectingJobsTable).set({ status: "failed" }).where(eq(prospectingJobsTable.id, job.id));
      res.status(502).json({ error: "Failed to reach PirateMonster API. Job recorded locally." });
      return;
    }

    const [updatedJob] = await db.select().from(prospectingJobsTable).where(eq(prospectingJobsTable.id, job.id));
    res.json(updatedJob ?? job);
  } catch (err) {
    console.error("Dispatch error:", err);
    res.status(500).json({ error: "Failed to dispatch job to PirateMonster" });
  }
});

export default router;
