import { Router, type IRouter } from "express";
import { db, aeoScoresTable, clientsTable, competitorUrlsTable, bingolingoContentTable, aeoScanRequestsTable } from "@workspace/db";
import { eq, desc, and, or, sql, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";
import { createNotification } from "../../../services/admin/notifications";
import { checkWorkflowTriggers } from "../../../services/missions/workflow-engine";
import { emitActivityEvent } from "../../../services/analytics/activity-events";
import { requireInboundSecret, queueWebhookDeliveries } from "./_shared";

const router: IRouter = Router();

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

async function matchClientByUrl(sourceUrl: string): Promise<number | null> {
  try {
    const urlObj = new URL(sourceUrl);
    const domain = urlObj.hostname.replace(/^www\./, "").toLowerCase();

    const candidates = [
      domain,
      `www.${domain}`,
      `http://${domain}`,
      `https://${domain}`,
      `http://www.${domain}`,
      `https://www.${domain}`,
      `http://${domain}/`,
      `https://${domain}/`,
      `http://www.${domain}/`,
      `https://www.${domain}/`,
    ];

    const [byWebsite] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(sql`LOWER(RTRIM(${clientsTable.websiteUrl}, '/')) = ANY(${candidates})`)
      .limit(1);
    if (byWebsite) return byWebsite.id;

    const emailDomain = `%@${domain}`;
    const [byEmail] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(sql`${clientsTable.contactEmail} ILIKE ${emailDomain}`)
      .limit(1);
    if (byEmail) return byEmail.id;
  } catch {
  }
  return null;
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

    if (clientId != null) {
      checkWorkflowTriggers("aeo_score_changed", {
        aeoScoreId: record.id,
        sourceUrl,
        overallScore,
        previousScore: previousScore?.overallScore ?? null,
        scoreDrop: previousScore ? previousScore.overallScore - overallScore : 0,
        scanType,
        clientId,
      }, clientId).catch((e) => console.error("[workflow-trigger] aeo_score_changed:", e));
    }

    emitActivityEvent({
      clientId: clientId ?? 0,
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

    const AEO_SCORE_DROP_THRESHOLD = 10;
    if (!isCompetitorScan && previousScore && (previousScore.overallScore - overallScore) >= AEO_SCORE_DROP_THRESHOLD) {
      const scoreDrop = previousScore.overallScore - overallScore;
      import("../../../services/guardian/queen-orchestrator").then(async ({ runSwarmCycle }) => {
        const { db: gdb, guardianIncidentsTable } = await import("@workspace/db");
        const crypto = await import("node:crypto");
        const fp = crypto.default.createHash("sha256").update(`aeo:score_drop:${sourceUrl}`).digest("hex").slice(0, 32);
        await gdb.insert(guardianIncidentsTable).values({
          domain: "aeo",
          title: `AEO Score Drop: ${sourceUrl} (${previousScore.overallScore} → ${overallScore})`,
          description: `AEO score dropped by ${scoreDrop} points in the latest scan. Threshold: ${AEO_SCORE_DROP_THRESHOLD}. Client: ${clientId ?? "unknown"}.`,
          severity: Math.min(100, 60 + scoreDrop),
          blastRadius: 65,
          status: "open",
          affectedComponent: sourceUrl,
          errorFingerprint: fp,
          sourcePayload: { sourceUrl, previousScore: previousScore.overallScore, overallScore, scoreDrop, clientId, type: "aeo_score_drop" },
        });
        await runSwarmCycle();
      }).catch((err) => console.error("[PirateMonster Bridge] Guardian AEO drop failed:", err));
    }

    if (isCompetitorScan && clientId) {
      const OVERTAKE_THRESHOLD = 5;
      const [clientBaseline] = await db
        .select({ overallScore: aeoScoresTable.overallScore, sourceUrl: aeoScoresTable.sourceUrl })
        .from(aeoScoresTable)
        .where(and(eq(aeoScoresTable.clientId, clientId), eq(aeoScoresTable.scanType, "client")))
        .orderBy(desc(aeoScoresTable.scannedAt))
        .limit(1);

      if (clientBaseline && overallScore > clientBaseline.overallScore + OVERTAKE_THRESHOLD) {
        const gap = overallScore - clientBaseline.overallScore;
        import("../../../services/guardian/queen-orchestrator").then(async ({ runSwarmCycle }) => {
          const { db: gdb, guardianIncidentsTable } = await import("@workspace/db");
          const crypto = await import("node:crypto");
          const fp = crypto.default.createHash("sha256").update(`piratemonster:competitor_overtake:${sourceUrl}:${clientId}`).digest("hex").slice(0, 32);
          await gdb.insert(guardianIncidentsTable).values({
            domain: "piratemonster",
            title: `Competitor Overtake: ${sourceUrl} (${overallScore}) beat client baseline (${clientBaseline.overallScore}) by ${gap} pts`,
            description: `Competitor URL "${sourceUrl}" now scores ${overallScore}, surpassing client baseline "${clientBaseline.sourceUrl}" (${clientBaseline.overallScore}) by ${gap} points — exceeding the ${OVERTAKE_THRESHOLD}-point overtake threshold. Client: ${clientId}.`,
            severity: Math.min(100, 55 + gap),
            blastRadius: 65,
            status: "open",
            affectedComponent: sourceUrl,
            errorFingerprint: fp,
            sourcePayload: { competitorUrl: sourceUrl, competitorScore: overallScore, clientUrl: clientBaseline.sourceUrl, clientScore: clientBaseline.overallScore, gap, clientId, type: "competitor_overtake" },
          });
          await runSwarmCycle();
        }).catch((err) => console.error("[PirateMonster Bridge] Competitor overtake guardian trigger failed:", err));
      }
    }

    res.status(200).json(record);
  } catch (err) {
    console.error("Error processing PirateMonster webhook:", err);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

export default router;
