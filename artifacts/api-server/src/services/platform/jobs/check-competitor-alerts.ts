import {
  db,
  clientsTable,
  competitorUrlsTable,
  aeoScoresTable,
  botsTable,
  botAssignmentsTable,
} from "@workspace/db";
import { eq, and, desc, gt, inArray } from "drizzle-orm";
import { broadcastSSE } from "../sse";
import { checkWorkflowTriggers } from "../../missions/workflow-engine";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let lastCompetitorAlertCheck = 0;
const COMPETITOR_ALERT_INTERVAL = 24 * 60 * 60 * 1000;

const HIGH_VALUE_ENGINES = ["chatgpt", "gemini"];

export async function checkCompetitorAlerts() {
  const now = Date.now();
  if (now - lastCompetitorAlertCheck < COMPETITOR_ALERT_INTERVAL) return;
  lastCompetitorAlertCheck = now;

  try {
    const clients = await db.select().from(clientsTable);

    for (const client of clients) {
      try {
        const competitors = await db
          .select()
          .from(competitorUrlsTable)
          .where(and(
            eq(competitorUrlsTable.clientId, client.id),
            eq(competitorUrlsTable.active, true)
          ));

        if (competitors.length === 0) continue;

        const competitorUrls = competitors.map(c => c.url);
        const allScores = await db
          .select()
          .from(aeoScoresTable)
          .where(and(
            inArray(aeoScoresTable.sourceUrl, competitorUrls),
            eq(aeoScoresTable.scanType, "competitor")
          ))
          .orderBy(desc(aeoScoresTable.scannedAt));

        const scoresByUrl = new Map<string, typeof allScores>();
        for (const score of allScores) {
          const existing = scoresByUrl.get(score.sourceUrl) ?? [];
          if (existing.length < 2) {
            existing.push(score);
            scoresByUrl.set(score.sourceUrl, existing);
          }
        }

        for (const comp of competitors) {
          const scores = scoresByUrl.get(comp.url) ?? [];

          if (scores.length < 2) continue;

          const [latest, previous] = scores;
          const scoreDelta = latest.overallScore - previous.overallScore;
          const absScoreDelta = Math.abs(scoreDelta);

          const latestEngines = latest.engineScores as Record<string, { score: number; cited: boolean }>;
          const prevEngines = previous.engineScores as Record<string, { score: number; cited: boolean }>;

          const engineChanges: Array<{ engine: string; gained: boolean }> = [];
          for (const engine of HIGH_VALUE_ENGINES) {
            const curr = latestEngines[engine];
            const prev = prevEngines[engine];
            if (curr && prev) {
              if (curr.cited && !prev.cited) engineChanges.push({ engine, gained: true });
              if (!curr.cited && prev.cited) engineChanges.push({ engine, gained: false });
            }
          }

          if (absScoreDelta >= 10 || engineChanges.length > 0) {
            broadcastSSE("competitor-alert", {
              clientId: client.id,
              companyName: client.companyName,
              competitor: {
                companyName: comp.companyName,
                url: comp.url,
              },
              scoreDelta,
              previousScore: previous.overallScore,
              newScore: latest.overallScore,
              engineChanges,
            });

            const gainedCitations = engineChanges.filter((c) => c.gained);
            if (gainedCitations.length > 0) {
              checkWorkflowTriggers("competitor_citation_gained", {
                clientId: client.id,
                companyName: client.companyName,
                competitorName: comp.companyName,
                competitorUrl: comp.url,
                enginesGained: gainedCitations.map((c) => c.engine),
                newScore: latest.overallScore,
                previousScore: previous.overallScore,
                scoreDelta,
              }, client.id).catch((e) => console.error("[workflow-trigger] competitor_citation_gained:", e));
            }

            const alertDetails = [];
            if (absScoreDelta >= 10) {
              alertDetails.push(`score ${scoreDelta > 0 ? "increased" : "decreased"} by ${absScoreDelta} points (${previous.overallScore} -> ${latest.overallScore})`);
            }
            for (const change of engineChanges) {
              alertDetails.push(`${change.gained ? "gained" : "lost"} citation on ${change.engine}`);
            }

            const [marketingBot] = await db
              .select()
              .from(botsTable)
              .where(eq(botsTable.department, "Marketing"));

            if (marketingBot) {
              const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
              const existingAlerts = await db
                .select()
                .from(botAssignmentsTable)
                .where(and(
                  eq(botAssignmentsTable.botId, marketingBot.id),
                  eq(botAssignmentsTable.clientId, client.id),
                  gt(botAssignmentsTable.createdAt, oneDayAgo)
                ));

              const alreadyAlerted = existingAlerts.some(a =>
                a.objective.includes(`COMPETITIVE ALERT: ${comp.companyName}`)
              );

              if (!alreadyAlerted) {
                await db.insert(botAssignmentsTable).values({
                  botId: marketingBot.id,
                  clientId: client.id,
                  objective: `COMPETITIVE ALERT: ${comp.companyName} (${comp.url}) — ${alertDetails.join("; ")}. Draft a competitive response brief analyzing the implications and recommending counter-strategies for ${client.companyName}.`,
                  schedule: "daily",
                  isActive: "true",
                  actionMode: "passive",
                });
              }
            }
          }
        }
      } catch (err: unknown) {
        console.error(`[scheduler] Competitor alert error for client ${client.id}: ${errMsg(err)}`);
      }
    }
  } catch (err: unknown) {
    console.error(`[scheduler] Competitor alert check failed: ${errMsg(err)}`);
  }
}
