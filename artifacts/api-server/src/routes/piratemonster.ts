import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, aeoScoresTable, clientsTable, botsTable, partnerRegistrationsTable, platformApiKeysTable, aeoWebhooksTable, aeoScanRequestsTable, mcpToolCallsTable, webhookDeliveriesTable, competitorUrlsTable, bingolingoClientsTable, bingolingoContentTable, prospectsTable, platformAuditLogTable, confidenceConfigsTable, prospectingJobsTable } from "@workspace/db";
import { eq, desc, and, or, gt, sql, isNotNull, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { runAgenticLoop } from "../tools/agentic-loop";
import { requireRole } from "../middleware/auth";
import { createNotification } from "../services/notifications";
import crypto from "node:crypto";
import { scoreConfidence } from "./prospecting";
import { checkWorkflowTriggers } from "../services/workflow-engine";
import { emitActivityEvent } from "../services/activity-events";

const router: IRouter = Router();

const PIRATEMONSTER_INBOUND_SECRET = process.env["PIRATEMONSTER_INBOUND_SECRET"] || "";
const PIRATEMONSTER_API_KEY = process.env["PIRATEMONSTER_API_KEY"] || "";
const PIRATEMONSTER_API_BASE_URL = process.env["PIRATEMONSTER_API_BASE_URL"] || "";

const EngineScoreSchema = z.object({
  score: z.number().min(0).max(100),
  cited: z.boolean(),
});

const WebhookPayloadSchema = z.object({
  sourceUrl: z.string().url(),
  overallScore: z.number().int().min(0).max(100),
  engineScores: z.object({
    chatgpt: EngineScoreSchema,
    gemini: EngineScoreSchema,
    perplexity: EngineScoreSchema,
    bing_copilot: EngineScoreSchema,
    meta_ai: EngineScoreSchema,
    deepseek: EngineScoreSchema,
    grok: EngineScoreSchema,
    claude: EngineScoreSchema,
    google_ai: EngineScoreSchema,
  }),
  citationCount: z.number().int().min(0),
  recommendations: z.array(z.string()),
  scannedAt: z.string().refine(
    (val) => !isNaN(new Date(val).getTime()),
    { message: "scannedAt must be a valid ISO 8601 date string" }
  ),
});

const PirateMonsterProspectSchema = z.object({
  companyName: z.string(),
  domain: z.string(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  socialLinks: z.record(z.string().url()).optional().nullable(),
});

const PirateMonsterBatchWebhookSchema = z.object({
  clientId: z.number(),
  jobId: z.number().optional(),
  prospects: z.array(PirateMonsterProspectSchema),
});

const RecommendPayloadSchema = z.object({
  url: z.string().url(),
  context: z.string().optional(),
});

function requireInboundSecret(req: Request, res: Response, next: NextFunction) {
  if (!PIRATEMONSTER_INBOUND_SECRET) {
    res.status(503).json({ error: "PirateMonster inbound secret not configured" });
    return;
  }

  const signature = req.headers["x-piratemonster-signature"] as string | undefined;
  if (!signature) {
    res.status(401).json({ error: "Missing x-piratemonster-signature header" });
    return;
  }

  const rawBody: Buffer | undefined = (req as Record<string, unknown>)["rawBody"] as Buffer | undefined;
  const bodyBytes = rawBody ?? Buffer.from(JSON.stringify(req.body));

  const expected = `sha256=${crypto
    .createHmac("sha256", PIRATEMONSTER_INBOUND_SECRET)
    .update(bodyBytes)
    .digest("hex")}`;

  try {
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      res.status(401).json({ error: "Invalid HMAC-SHA256 signature" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Invalid HMAC-SHA256 signature" });
    return;
  }

  next();
}

async function matchClientByUrl(sourceUrl: string): Promise<number | null> {
  try {
    const urlObj = new URL(sourceUrl);
    const domain = urlObj.hostname.replace(/^www\./, "").toLowerCase();

    const clients = await db.select().from(clientsTable);
    for (const client of clients) {
      const emailDomain = client.contactEmail.split("@")[1]?.toLowerCase();
      if (emailDomain && domain === emailDomain) {
        return client.id;
      }
    }
  } catch {
    // ignore URL parsing errors
  }
  return null;
}

async function queueWebhookDeliveries(scoreId: number, sourceUrl: string, eventType: string, payload: unknown) {
  try {
    const partnerKeysWithScans = await db
      .select({ partnerKeyId: aeoScanRequestsTable.partnerKeyId })
      .from(aeoScanRequestsTable)
      .where(eq(aeoScanRequestsTable.url, sourceUrl))
      .groupBy(aeoScanRequestsTable.partnerKeyId);

    const ownerKeyIds = new Set(partnerKeysWithScans.map((r) => r.partnerKeyId));

    const webhooks = await db
      .select()
      .from(aeoWebhooksTable)
      .where(eq(aeoWebhooksTable.status, "active"));

    const matchingWebhooks = webhooks.filter((wh) => {
      const events = wh.eventTypes as string[];
      return events.includes(eventType) && ownerKeyIds.has(wh.partnerKeyId);
    });

    if (matchingWebhooks.length === 0) return;

    const enrichedPayload = { ...(payload as Record<string, unknown>), sourceUrl };

    await db.insert(webhookDeliveriesTable).values(
      matchingWebhooks.map((wh) => ({
        webhookId: wh.id,
        scoreId,
        eventType,
        payload: enrichedPayload,
        status: "pending",
      }))
    );

    console.log(`[PM] Queued ${matchingWebhooks.length} webhook deliveries for event ${eventType} (url: ${sourceUrl})`);
  } catch (err) {
    console.error("[PM] Error queuing webhook deliveries:", err);
  }
}

export async function dispatchScanToPirateMonster(scanRequestId: number, url: string): Promise<{ success: boolean; pmScanId?: string; error?: string }> {
  const apiKey = process.env["PIRATEMONSTER_API_KEY"] || "";
  const apiBase = process.env["PIRATEMONSTER_API_BASE_URL"] || "";
  if (!apiKey || !apiBase) {
    return { success: false, error: "PirateMonster API credentials not configured" };
  }
  try {
    const response = await fetch(`${apiBase}/v1/scans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-GalaxyBots-Scan-Id": String(scanRequestId),
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PM] Scan dispatch failed for request ${scanRequestId}: HTTP ${response.status} — ${errorText}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json() as { id?: string; scan_id?: string };
    const pmScanId = data.id ?? data.scan_id ?? undefined;
    return { success: true, pmScanId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PM] Scan dispatch error for request ${scanRequestId}: ${msg}`);
    return { success: false, error: msg };
  }
}

async function updateScanRequests(sourceUrl: string, scoreId: number) {
  try {
    await db
      .update(aeoScanRequestsTable)
      .set({
        status: "complete",
        completedAt: new Date(),
        scoreId,
      })
      .where(
        and(
          eq(aeoScanRequestsTable.url, sourceUrl),
          or(
            eq(aeoScanRequestsTable.status, "queued"),
            eq(aeoScanRequestsTable.status, "processing")
          )
        )
      );
  } catch (err) {
    console.error("[PM] Error updating scan requests:", err);
  }
}

router.post("/prospecting/webhook/piratemonster", (req, res, next) => requireInboundSecret(req, res, next), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = PirateMonsterBatchWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid batch payload", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { clientId, jobId, prospects } = parsed.data;

    // Fetch confidence config to score inbound prospects
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
        email: p.email,
        phone: p.phone,
        socialLinks: p.socialLinks,
        status,
        confidenceScore: sql`${confidence.score}`,
        source: "piratemonster",
        updatedAt: new Date()
      };
    });

    if (valuesToInsert.length > 0) {
      await db.insert(prospectsTable).values(valuesToInsert as any);

      // Audit log entry for the batch
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

    // Deduplicate
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
    } as any).returning();

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
        await db
          .update(prospectingJobsTable)
          .set({ status: "submitted" as const, pmJobId })
          .where(eq(prospectingJobsTable.id, job.id));
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

router.post("/integrations/piratemonster/webhook", (req, res, next) => requireInboundSecret(req, res, next), async (req, res): Promise<void> => {
  try {
    const parsed = WebhookPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { sourceUrl, overallScore, engineScores, citationCount, recommendations, scannedAt } = parsed.data;

    const [previousScore] = await db
      .select()
      .from(aeoScoresTable)
      .where(eq(aeoScoresTable.sourceUrl, sourceUrl))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    const competitorMatches = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.url, sourceUrl),
        eq(competitorUrlsTable.active, true)
      ));

    const isCompetitorScan = competitorMatches.length > 0;
    const clientId = isCompetitorScan
      ? competitorMatches[0].clientId
      : await matchClientByUrl(sourceUrl);
    const scanType = isCompetitorScan ? "competitor" : "client";

    let bingolingoContentId: number | null = null;
    const [matchedContent] = await db
      .select({ id: bingolingoContentTable.id })
      .from(bingolingoContentTable)
      .where(eq(bingolingoContentTable.publishedUrl, sourceUrl))
      .limit(1);
    if (matchedContent) {
      bingolingoContentId = matchedContent.id;
    }

    const [record] = await db.insert(aeoScoresTable).values({
      clientId,
      bingolingoContentId,
      sourceUrl,
      overallScore,
      engineScores,
      citationCount,
      recommendations,
      scanType,
      scannedAt: new Date(scannedAt),
    }).onConflictDoUpdate({
      target: [aeoScoresTable.sourceUrl, aeoScoresTable.scannedAt],
      set: {
        overallScore,
        engineScores,
        citationCount,
        recommendations,
        clientId,
        bingolingoContentId,
        scanType,
      },
    }).returning();

    await queueWebhookDeliveries(record.id, sourceUrl, "scan_complete", {
      sourceUrl,
      overallScore,
      citationCount,
      scannedAt,
    });

    checkWorkflowTriggers("aeo_score_changed", {
      aeoScoreId: record.id,
      sourceUrl,
      overallScore,
      previousScore: previousScore?.overallScore ?? null,
      scoreDrop: previousScore ? previousScore.overallScore - overallScore : 0,
      scanType,
      clientId,
    }, clientId).catch((e) => console.error("[workflow-trigger] aeo_score_changed:", e));

    emitActivityEvent({
      clientId,
      eventType: "aeo_update",
      source: "piratemonster",
      severity: previousScore && overallScore < previousScore.overallScore ? "warning" : "info",
      title: `AEO scan complete — score ${overallScore}`,
      description: `${sourceUrl} scored ${overallScore}${previousScore ? ` (was ${previousScore.overallScore})` : ""}`,
      metadata: { aeoScoreId: record.id, sourceUrl, overallScore, previousScore: previousScore?.overallScore ?? null, scanType },
    });

    if (previousScore) {
      const prevEngines = previousScore.engineScores as Record<string, { score: number; cited: boolean }>;
      const newEngines = engineScores as Record<string, { score: number; cited: boolean }>;

      if (overallScore !== previousScore.overallScore) {
        await queueWebhookDeliveries(record.id, sourceUrl, "score_change", {
          sourceUrl,
          previousScore: previousScore.overallScore,
          newScore: overallScore,
          scoreDelta: overallScore - previousScore.overallScore,
          scannedAt,
        });

        const scoreDelta = overallScore - previousScore.overallScore;
        if (clientId) {
          createNotification({
            clientId,
            category: "competitor",
            severity: scoreDelta < 0 ? "warning" : "info",
            title: `AEO score ${scoreDelta > 0 ? "improved" : "dropped"}: ${overallScore} (${scoreDelta > 0 ? "+" : ""}${scoreDelta})`,
            body: `AEO score for ${sourceUrl} changed from ${previousScore.overallScore} to ${overallScore}`,
            link: clientId ? `/clients/${clientId}` : null,
            metadata: { sourceUrl, previousScore: previousScore.overallScore, newScore: overallScore, scoreDelta },
          }).catch((e) => console.error("[notifications] Failed to create competitor-alert notification:", e));
        }
      }

      const gainedEngines: string[] = [];
      const lostEngines: string[] = [];

      for (const [engine, data] of Object.entries(newEngines)) {
        const prev = prevEngines[engine];
        if (prev) {
          if (data.cited && !prev.cited) gainedEngines.push(engine);
          if (!data.cited && prev.cited) lostEngines.push(engine);
        } else if (data.cited) {
          gainedEngines.push(engine);
        }
      }

      if (gainedEngines.length > 0) {
        await queueWebhookDeliveries(record.id, sourceUrl, "citation_gained", {
          sourceUrl,
          engines: gainedEngines,
          newCitationCount: citationCount,
          previousCitationCount: previousScore.citationCount,
          scannedAt,
        });
      }

      if (lostEngines.length > 0) {
        await queueWebhookDeliveries(record.id, sourceUrl, "citation_lost", {
          sourceUrl,
          engines: lostEngines,
          newCitationCount: citationCount,
          previousCitationCount: previousScore.citationCount,
          scannedAt,
        });
      }
    }

    await updateScanRequests(sourceUrl, record.id);

    res.status(200).json(record);
  } catch (err) {
    console.error("Error processing PirateMonster webhook:", err);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

router.get("/integrations/piratemonster/scores/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  if (clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const scores = await db
      .select()
      .from(aeoScoresTable)
      .where(and(
        eq(aeoScoresTable.clientId, clientId),
        eq(aeoScoresTable.scanType, "client")
      ))
      .orderBy(desc(aeoScoresTable.scannedAt));

    res.json(scores);
  } catch (err) {
    console.error("Error fetching AEO scores:", err);
    res.status(500).json({ error: "Failed to fetch AEO scores" });
  }
});

router.post("/integrations/piratemonster/recommend", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const parsed = RecommendPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { url, context } = parsed.data;

    const [latestScore] = await db
      .select()
      .from(aeoScoresTable)
      .where(eq(aeoScoresTable.sourceUrl, url))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    const [marketingBot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.department, "Marketing"));

    const botName = marketingBot?.name ?? "Digital Marketing Director";
    const botTitle = marketingBot?.title ?? "Digital Marketing Director";
    const botPersonality = marketingBot?.personality ?? "Strategic and data-driven";
    const botResponsibilities = marketingBot?.responsibilities ?? ["Digital marketing strategy"];

    let scoreContext = "No AEO score data available for this URL.";
    if (latestScore) {
      const engines = latestScore.engineScores as Record<string, { score: number; cited: boolean }>;
      const missingEngines = Object.entries(engines)
        .filter(([, v]) => !v.cited)
        .map(([k]) => k);
      scoreContext = `Cloud 9 Score: ${latestScore.overallScore}/100. Citation count: ${latestScore.citationCount}. Missing citations on: ${missingEngines.join(", ") || "none"}. Recommendations: ${(latestScore.recommendations as string[]).join("; ")}`;
    }

    const systemPrompt = `You are ${botName}, ${botTitle}.
Personality: ${botPersonality}
Your responsibilities: ${Array.isArray(botResponsibilities) ? botResponsibilities.join("; ") : botResponsibilities}

You are an expert in AEO (Answer Engine Optimization) — the practice of optimizing websites to appear as cited sources in AI answer engines like ChatGPT, Gemini, Perplexity, and others.

Provide a strategic AEO recommendation for the given URL based on the score data. Be specific, actionable, and prioritize the highest-impact improvements. You have access to tools to look up additional data if needed.`;

    const userMessage = `URL: ${url}\n\nCurrent AEO Data: ${scoreContext}${context ? `\n\nAdditional Context: ${context}` : ""}

Please provide a strategic AEO recommendation with specific, actionable steps to improve AI visibility.`;

    const loopResult = await runAgenticLoop({
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      context: {
        botId: marketingBot?.id,
        botName,
        clientId: latestScore?.clientId ?? undefined,
      },
      maxIterations: 5,
      maxTokens: 800,
    });

    res.json({
      url,
      recommendation: loopResult.finalContent,
      botName,
      botTitle,
      scoreData: latestScore ? {
        overallScore: latestScore.overallScore,
        citationCount: latestScore.citationCount,
        scannedAt: latestScore.scannedAt,
      } : null,
    });
  } catch (err) {
    console.error("Error generating AEO recommendation:", err);
    res.status(500).json({ error: "Failed to generate recommendation" });
  }
});

router.get("/integrations/piratemonster/config", async (_req, res): Promise<void> => {
  const inboundSecretMasked = PIRATEMONSTER_INBOUND_SECRET
    ? "••••••••" + PIRATEMONSTER_INBOUND_SECRET.slice(-4)
    : null;
  const apiBaseUrlMasked = PIRATEMONSTER_API_BASE_URL
    ? PIRATEMONSTER_API_BASE_URL.replace(/^(https?:\/\/[^/]{4}).*/, "$1••••")
    : null;

  res.json({
    webhookUrl: "/api/integrations/piratemonster/webhook",
    recommendUrl: "/api/integrations/piratemonster/recommend",
    method: "POST",
    apiKeyHeader: "x-piratemonster-signature",
    inboundSecretConfigured: !!PIRATEMONSTER_INBOUND_SECRET,
    inboundSecretMasked,
    outboundKeyConfigured: !!PIRATEMONSTER_API_KEY,
    apiBaseUrlConfigured: !!PIRATEMONSTER_API_BASE_URL,
    apiBaseUrlMasked,
    allCredentialsConfigured: !!PIRATEMONSTER_INBOUND_SECRET && !!PIRATEMONSTER_API_KEY && !!PIRATEMONSTER_API_BASE_URL,
    engines: ["chatgpt", "gemini", "perplexity", "bing_copilot", "meta_ai", "deepseek", "grok", "claude", "google_ai"],
  });
});

router.post("/integrations/piratemonster/register-partner", (req, res, next) => requireInboundSecret(req, res, next), async (_req, res): Promise<void> => {
  try {
    const existing = await db
      .select()
      .from(partnerRegistrationsTable)
      .where(eq(partnerRegistrationsTable.partnerRef, "piratemonster"));

    if (existing.length > 0) {
      res.json({ message: "PirateMonster partner already registered", partner: existing[0] });
      return;
    }

    const [partner] = await db.insert(partnerRegistrationsTable).values({
      partnerRef: "piratemonster",
      clientId: 0,
      companyName: "PirateMonster.com",
      contactName: "PirateMonster Platform",
      contactEmail: "platform@piratemonster.com",
      plan: "enterprise",
      source: "platform_integration",
      status: "active",
    }).returning();

    res.status(201).json(partner);
  } catch (err) {
    console.error("Error registering PirateMonster partner:", err);
    res.status(500).json({ error: "Failed to register partner" });
  }
});

router.post("/integrations/piratemonster/mcp-keys", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const { label } = req.body || {};

    const rawKey = `pmk_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const [key] = await db.insert(platformApiKeysTable).values({
      platform: "piratemonster_mcp",
      label: label || null,
      keyHash,
      status: "active",
      rateLimit: 100,
    }).returning();

    res.status(201).json({
      id: key.id,
      key: rawKey,
      label: key.label,
      rateLimit: key.rateLimit,
      status: key.status,
      createdAt: key.createdAt.toISOString(),
      warning: "Store this key securely. It will not be shown again.",
    });
  } catch (err) {
    console.error("Error creating MCP key:", err);
    res.status(500).json({ error: "Failed to create MCP key" });
  }
});

router.get("/integrations/piratemonster/mcp-keys", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  try {
    const keys = await db
      .select({
        id: platformApiKeysTable.id,
        label: platformApiKeysTable.label,
        status: platformApiKeysTable.status,
        rateLimit: platformApiKeysTable.rateLimit,
        allowedTools: platformApiKeysTable.allowedTools,
        createdAt: platformApiKeysTable.createdAt,
        revokedAt: platformApiKeysTable.revokedAt,
      })
      .from(platformApiKeysTable)
      .where(eq(platformApiKeysTable.platform, "piratemonster_mcp"))
      .orderBy(desc(platformApiKeysTable.createdAt));

    res.json(keys);
  } catch (err) {
    console.error("Error listing MCP keys:", err);
    res.status(500).json({ error: "Failed to list MCP keys" });
  }
});

router.post("/integrations/piratemonster/mcp-keys/:id/revoke", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const keyId = Number(req.params.id);
    if (isNaN(keyId)) {
      res.status(400).json({ error: "Invalid key ID" });
      return;
    }

    const [updated] = await db
      .update(platformApiKeysTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(
        and(
          eq(platformApiKeysTable.id, keyId),
          eq(platformApiKeysTable.platform, "piratemonster_mcp")
        )
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Key not found" });
      return;
    }

    res.json({ id: updated.id, status: updated.status, revokedAt: updated.revokedAt });
  } catch (err) {
    console.error("Error revoking MCP key:", err);
    res.status(500).json({ error: "Failed to revoke MCP key" });
  }
});

router.get("/integrations/piratemonster/aeo-health", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  if (!req.user?.bypassPayment) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await db.execute(sql`
      WITH ranked AS (
        SELECT
          s.client_id,
          s.overall_score,
          s.citation_count,
          s.scanned_at,
          ROW_NUMBER() OVER (PARTITION BY s.client_id ORDER BY s.scanned_at DESC) AS rn
        FROM aeo_scores s
        WHERE s.scan_type = 'client' AND s.client_id IS NOT NULL
      ),
      latest AS (
        SELECT client_id, overall_score AS latest_score, citation_count, scanned_at AS latest_scanned_at
        FROM ranked WHERE rn = 1
      ),
      previous AS (
        SELECT client_id, overall_score AS prev_score
        FROM ranked WHERE rn = 2
      )
      SELECT
        c.id AS client_id,
        c.company_name,
        l.latest_score,
        l.citation_count,
        l.latest_scanned_at AS scanned_at,
        p.prev_score
      FROM clients c
      LEFT JOIN latest l ON l.client_id = c.id
      LEFT JOIN previous p ON p.client_id = c.id
      WHERE c.status = 'active'
      ORDER BY l.latest_score ASC NULLS FIRST
    `);

    const results = (rows.rows as Array<{
      client_id: number;
      company_name: string;
      latest_score: number | null;
      citation_count: number | null;
      scanned_at: string | null;
      prev_score: number | null;
    }>).map((row) => {
      const delta = row.latest_score !== null && row.prev_score !== null
        ? row.latest_score - row.prev_score
        : null;
      const trend = delta === null
        ? "no_data"
        : delta > 0 ? "improving" : delta < 0 ? "declining" : "stable";
      const isStale = !row.scanned_at || new Date(row.scanned_at) < sevenDaysAgo;

      return {
        clientId: row.client_id,
        companyName: row.company_name,
        latestScore: row.latest_score,
        citationCount: row.citation_count,
        scannedAt: row.scanned_at,
        delta,
        trend,
        isStale,
        noData: row.scanned_at === null,
      };
    });

    res.json(results);
  } catch (err) {
    console.error("Error fetching AEO health:", err);
    res.status(500).json({ error: "Failed to fetch AEO health" });
  }
});

router.get("/integrations/piratemonster/mcp-stats", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  if (!req.user?.bypassPayment) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const toolCallStats = await db
      .select({
        toolName: mcpToolCallsTable.toolName,
        count: sql<number>`count(*)::int`,
        cachedCount: sql<number>`sum(case when ${mcpToolCallsTable.cached} then 1 else 0 end)::int`,
      })
      .from(mcpToolCallsTable)
      .where(gt(mcpToolCallsTable.calledAt, sevenDaysAgo))
      .groupBy(mcpToolCallsTable.toolName);

    const totalCalls = toolCallStats.reduce((sum, s) => sum + s.count, 0);
    const totalCached = toolCallStats.reduce((sum, s) => sum + (s.cachedCount || 0), 0);
    const cacheHitRate = totalCalls > 0 ? Math.round((totalCached / totalCalls) * 100) : 0;

    const [{ count: activeWebhookCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aeoWebhooksTable)
      .where(eq(aeoWebhooksTable.status, "active"));

    const [{ count: pendingScanCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aeoScanRequestsTable)
      .where(eq(aeoScanRequestsTable.status, "queued"));

    res.json({
      toolCallStats,
      totalCalls,
      cacheHitRate,
      activeWebhookCount,
      pendingScanCount,
    });
  } catch (err) {
    console.error("Error fetching MCP stats:", err);
    res.status(500).json({ error: "Failed to fetch MCP stats" });
  }
});

router.get("/integrations/piratemonster/competitors/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }
  if (!req.user?.bypassPayment && clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const competitors = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ));

    const [clientScore] = await db
      .select()
      .from(aeoScoresTable)
      .where(and(
        eq(aeoScoresTable.clientId, clientId),
        eq(aeoScoresTable.scanType, "client")
      ))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    const results = [];
    for (const comp of competitors) {
      const [latestScore] = await db
        .select()
        .from(aeoScoresTable)
        .where(and(
          eq(aeoScoresTable.sourceUrl, comp.url),
          eq(aeoScoresTable.scanType, "competitor")
        ))
        .orderBy(desc(aeoScoresTable.scannedAt))
        .limit(1);

      results.push({
        id: comp.id,
        companyName: comp.companyName,
        url: comp.url,
        addedBy: comp.addedBy,
        active: comp.active,
        createdAt: comp.createdAt.toISOString(),
        latestScore: latestScore ? {
          overallScore: latestScore.overallScore,
          citationCount: latestScore.citationCount,
          engineScores: latestScore.engineScores,
          scannedAt: latestScore.scannedAt.toISOString(),
        } : null,
        delta: latestScore && clientScore
          ? clientScore.overallScore - latestScore.overallScore
          : null,
      });
    }

    res.json({
      clientScore: clientScore ? clientScore.overallScore : null,
      competitors: results,
    });
  } catch (err) {
    console.error("Error fetching competitors:", err);
    res.status(500).json({ error: "Failed to fetch competitors" });
  }
});

router.post("/integrations/piratemonster/competitors/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }
  if (!req.user?.bypassPayment && clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { url: rawUrl, companyName } = req.body || {};
  if (!rawUrl || !companyName) {
    res.status(400).json({ error: "url and companyName are required" });
    return;
  }

  const trimmed = String(rawUrl).trim();
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL format" });
    return;
  }

  try {
    const activeCount = await db
      .select({ id: competitorUrlsTable.id })
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ));

    if (activeCount.length >= 10) {
      res.status(400).json({ error: "Maximum of 10 active competitors per client" });
      return;
    }

    const existingUrl = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.url, url),
        eq(competitorUrlsTable.active, true)
      ));

    if (existingUrl.length > 0) {
      res.status(400).json({ error: "This URL is already being tracked" });
      return;
    }

    const [record] = await db.insert(competitorUrlsTable).values({
      clientId,
      url,
      companyName,
      addedBy: "dashboard",
    }).returning();

    const [partnerKey] = await db
      .select({ id: platformApiKeysTable.id })
      .from(platformApiKeysTable)
      .where(
        and(
          eq(platformApiKeysTable.platform, "piratemonster_mcp"),
          eq(platformApiKeysTable.status, "active"),
          eq(platformApiKeysTable.clientId, clientId)
        )
      )
      .limit(1);

    if (partnerKey) {
      await db.insert(aeoScanRequestsTable).values({
        partnerKeyId: partnerKey.id,
        url,
        status: "queued",
      });
    }

    res.status(201).json(record);
  } catch (err) {
    console.error("Error tracking competitor:", err);
    res.status(500).json({ error: "Failed to track competitor" });
  }
});

router.post("/integrations/piratemonster/competitors/:clientId/:competitorId/untrack", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const competitorId = Number(req.params.competitorId);

  if (isNaN(clientId) || isNaN(competitorId)) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  try {
    const [updated] = await db
      .update(competitorUrlsTable)
      .set({ active: false })
      .where(and(
        eq(competitorUrlsTable.id, competitorId),
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Competitor not found or already inactive" });
      return;
    }

    res.json({ success: true, competitor: updated });
  } catch (err) {
    console.error("Error untracking competitor:", err);
    res.status(500).json({ error: "Failed to untrack competitor" });
  }
});

router.get("/integrations/piratemonster/content-attribution/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const galaxybotsClientId = Number(req.params.clientId);
  if (isNaN(galaxybotsClientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  try {
    const blClients = await db
      .select()
      .from(bingolingoClientsTable)
      .where(eq(bingolingoClientsTable.galaxybotsClientId, galaxybotsClientId));

    if (blClients.length === 0) {
      res.json({ linked: false, content: [] });
      return;
    }

    const results = [];
    for (const blClient of blClients) {
      const publishedContent = await db
        .select()
        .from(bingolingoContentTable)
        .where(and(
          eq(bingolingoContentTable.clientId, blClient.id),
          eq(bingolingoContentTable.status, "published"),
          isNotNull(bingolingoContentTable.publishedUrl)
        ))
        .orderBy(desc(bingolingoContentTable.publishedAt));

      for (const content of publishedContent) {
        let scores = await db
          .select()
          .from(aeoScoresTable)
          .where(eq(aeoScoresTable.bingolingoContentId, content.id))
          .orderBy(desc(aeoScoresTable.scannedAt));

        if (scores.length === 0 && content.publishedUrl) {
          scores = await db
            .select()
            .from(aeoScoresTable)
            .where(eq(aeoScoresTable.sourceUrl, content.publishedUrl))
            .orderBy(desc(aeoScoresTable.scannedAt));
        }

        if (scores.length === 0) {
          results.push({
            contentId: content.id,
            title: content.title,
            publishedUrl: content.publishedUrl,
            publishedAt: content.publishedAt,
            type: content.type,
            baselineScore: null,
            currentScore: null,
            delta: null,
            enginesGained: [] as string[],
            enginesLost: [] as string[],
            status: "awaiting_scan",
          });
          continue;
        }

        const latest = scores[0];
        const baseline = scores[scores.length - 1];
        const baselineEngines = baseline.engineScores as Record<string, { score: number; cited: boolean }>;
        const latestEngines = latest.engineScores as Record<string, { score: number; cited: boolean }>;

        const enginesGained: string[] = [];
        const enginesLost: string[] = [];
        for (const [engine, data] of Object.entries(latestEngines)) {
          const prev = baselineEngines[engine];
          if (prev) {
            if (data.cited && !prev.cited) enginesGained.push(engine);
            if (!data.cited && prev.cited) enginesLost.push(engine);
          } else if (data.cited) {
            enginesGained.push(engine);
          }
        }

        results.push({
          contentId: content.id,
          title: content.title,
          publishedUrl: content.publishedUrl,
          publishedAt: content.publishedAt,
          type: content.type,
          baselineScore: baseline.overallScore,
          currentScore: latest.overallScore,
          delta: latest.overallScore - baseline.overallScore,
          enginesGained,
          enginesLost,
          status: "tracked",
        });
      }
    }

    res.json({
      linked: true,
      bingolingoClients: blClients.map(c => ({ id: c.id, name: c.name, slug: c.slug })),
      content: results,
    });
  } catch (err) {
    console.error("Error fetching content attribution:", err);
    res.status(500).json({ error: "Failed to fetch content attribution" });
  }
});

router.post("/aeo/scan/request", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const orgClientId = req.user?.clientId;
  if (!orgClientId) {
    res.status(403).json({ error: "No organization context found." });
    return;
  }

  const [partnerKey] = await db
    .select({ id: platformApiKeysTable.id })
    .from(platformApiKeysTable)
    .where(
      and(
        eq(platformApiKeysTable.platform, "piratemonster_mcp"),
        eq(platformApiKeysTable.status, "active"),
        eq(platformApiKeysTable.clientId, orgClientId)
      )
    )
    .limit(1);

  if (!partnerKey) {
    res.status(422).json({ error: "No active PirateMonster integration found for your organization. Configure it in Integrations to enable AEO scans." });
    return;
  }

  const [scanRequest] = await db.insert(aeoScanRequestsTable).values({
    partnerKeyId: partnerKey.id,
    url: url.trim(),
    status: "queued",
  }).returning();

  const dispatch = await dispatchScanToPirateMonster(scanRequest.id, url.trim());
  if (dispatch.success) {
    await db
      .update(aeoScanRequestsTable)
      .set({ status: "processing" })
      .where(eq(aeoScanRequestsTable.id, scanRequest.id));
  } else {
    console.warn(`[PM] Immediate scan dispatch failed for request ${scanRequest.id}: ${dispatch.error} — will retry via background queue`);
  }

  res.json({ success: true, message: "AEO scan queued. Results will appear in the AEO Intelligence tab once processing completes.", requestId: scanRequest.id });
});

router.get("/integrations/piratemonster/pending-scans/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  try {
    const partnerKeys = await db
      .select({ id: platformApiKeysTable.id })
      .from(platformApiKeysTable)
      .where(
        and(
          eq(platformApiKeysTable.platform, "piratemonster_mcp"),
          eq(platformApiKeysTable.status, "active"),
          eq(platformApiKeysTable.clientId, clientId)
        )
      );

    if (partnerKeys.length === 0) {
      res.json({ pendingCount: 0 });
      return;
    }

    const keyIds = partnerKeys.map(k => k.id);
    const pending = await db
      .select({ id: aeoScanRequestsTable.id })
      .from(aeoScanRequestsTable)
      .where(
        and(
          inArray(aeoScanRequestsTable.partnerKeyId, keyIds),
          or(
            eq(aeoScanRequestsTable.status, "queued"),
            eq(aeoScanRequestsTable.status, "processing")
          )
        )
      );

    res.json({ pendingCount: pending.length });
  } catch (err) {
    console.error("Error fetching pending scans:", err);
    res.status(500).json({ error: "Failed to fetch pending scans" });
  }
});

router.get("/integrations/piratemonster/bingolingo-link/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const galaxybotsClientId = Number(req.params.clientId);
  if (isNaN(galaxybotsClientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const blClients = await db
    .select()
    .from(bingolingoClientsTable)
    .where(eq(bingolingoClientsTable.galaxybotsClientId, galaxybotsClientId));

  res.json({
    linked: blClients.length > 0,
    bingolingoClients: blClients.map(c => ({ id: c.id, name: c.name, slug: c.slug })),
  });
});

export default router;
