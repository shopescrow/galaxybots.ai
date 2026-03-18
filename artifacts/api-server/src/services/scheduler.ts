import {
  db,
  pool,
  botAssignmentsTable,
  backgroundReportsTable,
  botsTable,
  clientsTable,
  knowledgeBaseSourcesTable,
  bingolingoClientsTable,
  bingolingoContentTable,
  competitorUrlsTable,
  aeoScoresTable,
  aeoScanRequestsTable,
  platformApiKeysTable,
  pipelinesTable,
  taskSessionsTable,
  partnersTable,
  partnerRegistrationsTable,
  partnerTierReviewLogTable,
} from "@workspace/db";
import { eq, and, lte, isNull, or, ne, desc, gt, isNotNull, count } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateWeeklyBriefing } from "./roi";
import { syncSource } from "./kb-sync";
import { runAgenticLoop } from "../tools/agentic-loop";
import { shouldPauseAutonomous } from "./cost-caps";
import { createNotification } from "./notifications";
import { computeAllHealthScores, generateWeeklyPulse } from "./client-health";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SCHEDULER_LOCK_ID = 999999;

const SCHEDULE_INTERVALS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

let sseClients: Array<{ id: string; clientId: number; res: import("express").Response }> = [];

export function addSSEClient(id: string, res: import("express").Response, clientId: number) {
  sseClients.push({ id, clientId, res });
  res.on("close", () => {
    sseClients = sseClients.filter((c) => c.id !== id);
  });
}

export function broadcastSSE(event: string, data: Record<string, unknown>) {
  const targetClientId = data.clientId as number | undefined;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (targetClientId !== undefined && client.clientId !== targetClientId) continue;
    try {
      client.res.write(payload);
    } catch (_e) {}
  }
}

async function runPassiveAssignment(assignment: typeof botAssignmentsTable.$inferSelect, bot: typeof botsTable.$inferSelect) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}

You have been assigned an ongoing monitoring responsibility. Produce a professional briefing report on the current status of your assigned objective. Be specific, insightful, and actionable.`,
      },
      {
        role: "user",
        content: `STANDING OBJECTIVE: ${assignment.objective}\n\nProduce your periodic briefing report.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "Report generation failed.";

  const summaryCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content: "Summarize the following report in one concise sentence.",
      },
      { role: "user", content },
    ],
  });

  const summary = summaryCompletion.choices[0]?.message?.content ?? content.substring(0, 200);

  return { content, summary, runStatus: "success" as const };
}

async function runActiveAssignment(assignment: typeof botAssignmentsTable.$inferSelect, bot: typeof botsTable.$inferSelect): Promise<{ content: string; summary: string; runStatus: "success" | "partial" | "failed" }> {
  const missionPrompt = assignment.actionPrompt || assignment.objective;

  const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}

You are executing a standing order autonomously. Use your available tools to complete the mission objective below. Take real actions — post messages, send emails, create documents, look up data — whatever is needed to fulfill the order. When done, provide a concise summary of what you accomplished.`;

  const result = await runAgenticLoop({
    model: "gpt-4o-mini",
    maxIterations: 10,
    maxTokens: 1500,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: `STANDING ORDER: ${missionPrompt}\n\nExecute this order now using your available tools. Report back on what you accomplished.`,
      },
    ],
    context: {
      clientId: assignment.clientId ?? undefined,
      botId: bot.id,
      botName: bot.name,
    },
  });

  const hasError = result.events.some((e) => e.type === "error");
  const hasToolBlocked = result.events.some((e) => e.type === "tool_blocked");
  const paused = result.paused === true;

  let runStatus: "success" | "partial" | "failed";
  if (hasError && !result.finalContent) {
    runStatus = "failed";
  } else if (hasError || hasToolBlocked || paused) {
    runStatus = "partial";
  } else {
    runStatus = "success";
  }

  const content = result.finalContent || "Active execution completed but produced no output.";

  const summaryCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content: "Summarize the following execution report in one concise sentence.",
      },
      { role: "user", content },
    ],
  });

  const summary = summaryCompletion.choices[0]?.message?.content ?? content.substring(0, 200);

  return { content, summary, runStatus };
}

async function runAssignment(assignmentId: number) {
  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.id, assignmentId));

  if (!assignment || assignment.isActive !== "true") return null;

  if (assignment.clientId) {
    const paused = await shouldPauseAutonomous(assignment.clientId);
    if (paused) {
      broadcastSSE("cost_alert", {
        clientId: assignment.clientId,
        level: "critical",
        message: `Autonomous run skipped for assignment #${assignmentId}: monthly cost cap exceeded`,
      });
      createNotification({
        clientId: assignment.clientId,
        category: "cost",
        severity: "critical",
        title: "Autonomous run skipped",
        body: `Autonomous run skipped for assignment #${assignmentId}: monthly cost cap exceeded`,
        link: "/analytics",
        isScheduled: true,
      }).catch((e) => console.error("[notifications] Failed to create cost_alert notification:", e));
      return null;
    }
  }

  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, assignment.botId));

  if (!bot) return null;

  let reportData: { content: string; summary: string; runStatus: "success" | "partial" | "failed" };

  if (assignment.actionMode === "active") {
    reportData = await runActiveAssignment(assignment, bot);
  } else {
    reportData = await runPassiveAssignment(assignment, bot);
  }

  const [report] = await db
    .insert(backgroundReportsTable)
    .values({
      assignmentId: assignment.id,
      botId: assignment.botId,
      clientId: assignment.clientId,
      content: reportData.content,
      summary: reportData.summary,
      runStatus: reportData.runStatus,
      deliveredAt: new Date(),
    })
    .returning();

  await db
    .update(botAssignmentsTable)
    .set({ lastRunAt: new Date() })
    .where(eq(botAssignmentsTable.id, assignmentId));

  broadcastSSE("background-report", {
    reportId: report.id,
    assignmentId: assignment.id,
    botId: bot.id,
    botName: bot.name,
    clientId: assignment.clientId,
    summary: reportData.summary,
    runStatus: reportData.runStatus,
    actionMode: assignment.actionMode,
  });

  createNotification({
    clientId: assignment.clientId,
    category: "bot",
    severity: "info",
    title: `Background report from ${bot.name}`,
    body: reportData.summary,
    link: "/command-center",
    metadata: { reportId: report.id, botId: bot.id },
    isScheduled: true,
  }).catch((e) => console.error("[notifications] Failed to create background-report notification:", e));

  if (reportData.runStatus === "failed" || reportData.runStatus === "partial") {
    broadcastSSE("assignment-alert", {
      reportId: report.id,
      assignmentId: assignment.id,
      botId: bot.id,
      botName: bot.name,
      clientId: assignment.clientId,
      runStatus: reportData.runStatus,
      summary: reportData.summary,
      message: reportData.runStatus === "failed"
        ? `Standing order failed for ${bot.name}: ${reportData.summary}`
        : `Standing order partially completed by ${bot.name}: ${reportData.summary}`,
    });

    createNotification({
      clientId: assignment.clientId,
      category: "bot",
      severity: reportData.runStatus === "failed" ? "critical" : "warning",
      title: reportData.runStatus === "failed"
        ? `Standing order failed for ${bot.name}`
        : `Standing order partially completed by ${bot.name}`,
      body: reportData.summary,
      link: "/bots",
      metadata: { reportId: report.id, assignmentId: assignment.id, botId: bot.id },
      isScheduled: true,
    }).catch((e) => console.error("[notifications] Failed to create assignment-alert notification:", e));
  }

  return report;
}

async function checkDueAssignments() {
  const now = new Date();

  const assignments = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.isActive, "true"));

  for (const assignment of assignments) {
    const interval = SCHEDULE_INTERVALS[assignment.schedule] ?? SCHEDULE_INTERVALS.daily;

    if (!assignment.lastRunAt) {
      try {
        await runAssignment(assignment.id);
      } catch (err: unknown) {
        console.error(`[scheduler] Error for client ${assignment.clientId ?? 'unknown'}: assignment ${assignment.id} failed — ${errMsg(err)}`);
      }
      continue;
    }

    const elapsed = now.getTime() - new Date(assignment.lastRunAt).getTime();
    if (elapsed >= interval) {
      try {
        await runAssignment(assignment.id);
      } catch (err: unknown) {
        console.error(`[scheduler] Error for client ${assignment.clientId ?? 'unknown'}: assignment ${assignment.id} failed — ${errMsg(err)}`);
      }
    }
  }
}

let lastWeeklyBriefingCheck = 0;
const WEEKLY_BRIEFING_INTERVAL = 7 * 24 * 60 * 60 * 1000;

async function checkWeeklyBriefings() {
  const now = Date.now();
  if (now - lastWeeklyBriefingCheck < WEEKLY_BRIEFING_INTERVAL) return;
  lastWeeklyBriefingCheck = now;

  try {
    const clients = await db.select().from(clientsTable);
    for (const client of clients) {
      try {
        const briefing = await generateWeeklyBriefing(client.id);
        broadcastSSE("weekly-briefing", {
          clientId: client.id,
          companyName: client.companyName,
          briefing: briefing.briefing,
          highlights: briefing.highlights,
          recommendation: briefing.recommendation,
        });
        createNotification({
          clientId: client.id,
          category: "system",
          severity: "info",
          title: `Weekly briefing for ${client.companyName}`,
          body: briefing.briefing.substring(0, 500),
          link: "/roi",
          metadata: { highlights: briefing.highlights },
          isScheduled: true,
        }).catch((e) => console.error("[notifications] Failed to create weekly-briefing notification:", e));
      } catch (err: unknown) {
        console.error(`[scheduler] Error for client ${client.id}: ${errMsg(err)}`);
      }
    }
  } catch (err: unknown) {
    console.error(`[scheduler] Weekly briefing check failed: ${errMsg(err)}`);
  }
}

async function checkKnowledgeBaseSyncs() {
  const now = new Date();

  const sources = await db
    .select()
    .from(knowledgeBaseSourcesTable)
    .where(
      and(
        ne(knowledgeBaseSourcesTable.status, "syncing"),
        ne(knowledgeBaseSourcesTable.status, "disabled")
      )
    );

  for (const source of sources) {
    const interval = SCHEDULE_INTERVALS[source.syncSchedule] ?? SCHEDULE_INTERVALS.daily;

    if (!source.lastSyncAt) {
      try {
        await syncSource(source.id);
      } catch (err: unknown) {
        console.error(`[scheduler] Error for KB source ${source.id}: ${errMsg(err)}`);
      }
      continue;
    }

    const elapsed = now.getTime() - new Date(source.lastSyncAt).getTime();
    if (elapsed >= interval) {
      try {
        await syncSource(source.id);
      } catch (err: unknown) {
        console.error(`[scheduler] Error for KB source ${source.id}: ${errMsg(err)}`);
      }
    }
  }
}

let lastBingolingoCheck = 0;
const BINGOLINGO_WEEKLY_INTERVAL = 7 * 24 * 60 * 60 * 1000;

async function checkBingolingoAutoContent() {
  const now = Date.now();
  if (now - lastBingolingoCheck < BINGOLINGO_WEEKLY_INTERVAL) return;
  lastBingolingoCheck = now;

  try {
    const clients = await db
      .select()
      .from(bingolingoClientsTable)
      .where(eq(bingolingoClientsTable.autoContentEnabled, true));

    for (const client of clients) {
      try {
        const topicCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_completion_tokens: 200,
          messages: [
            {
              role: "system",
              content: `Suggest a single compelling blog post topic for a company in the ${client.industry} industry called "${client.name}". Return only the topic title, nothing else.`,
            },
            { role: "user", content: "Suggest a timely, relevant blog topic." },
          ],
        });
        const topic = topicCompletion.choices[0]?.message?.content?.trim() || `${client.industry} insights for ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;

        const systemPrompt = `You are an expert SEO content writer. Generate a well-structured blog post with an engaging H1 title, clear H2/H3 subheadings, SEO-optimized content, and a strong conclusion. Return in markdown format.`;
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_completion_tokens: 3000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Industry: ${client.industry}\nCompany: ${client.name}\nTopic: ${topic}\nTone: ${client.defaultTone}\n\nGenerate the content now.` },
          ],
        });

        const body = completion.choices[0]?.message?.content ?? "";
        const titleMatch = body.match(/^#\s+(.+)$/m) || body.match(/^(.+)\n/);
        const title = titleMatch ? titleMatch[1].replace(/^#+\s*/, "").trim() : topic;
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

        await db.insert(bingolingoContentTable).values({
          clientId: client.id,
          type: "blog",
          title,
          slug,
          body,
          metaDescription: body.slice(0, 155).trim() + "...",
          status: "draft",
          topic,
          tone: client.defaultTone,
          keywords: null,
        });

        broadcastSSE("bingolingo-auto-content", {
          clientId: client.galaxybotsClientId,
          bingolingoClientId: client.id,
          clientName: client.name,
          title,
          message: `BingoLingo auto-generated a draft blog post: "${title}"`,
        });
      } catch (err: unknown) {
        console.error(`[scheduler] BingoLingo auto-content for client ${client.id}: ${errMsg(err)}`);
      }
    }
  } catch (err: unknown) {
    console.error(`[scheduler] BingoLingo auto-content check failed: ${errMsg(err)}`);
  }
}

let lastCompetitorAlertCheck = 0;
const COMPETITOR_ALERT_INTERVAL = 24 * 60 * 60 * 1000;

const HIGH_VALUE_ENGINES = ["chatgpt", "gemini"];

async function checkCompetitorAlerts() {
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

        for (const comp of competitors) {
          const scores = await db
            .select()
            .from(aeoScoresTable)
            .where(and(
              eq(aeoScoresTable.sourceUrl, comp.url),
              eq(aeoScoresTable.scanType, "competitor")
            ))
            .orderBy(desc(aeoScoresTable.scannedAt))
            .limit(2);

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

let lastHealthScoreCheck = 0;
const HEALTH_SCORE_INTERVAL = 24 * 60 * 60 * 1000;

async function triggerRetentionAction(clientId: number, tag: string, previousTag: string, score: number) {
  try {
    const pipelines = await db
      .select()
      .from(pipelinesTable)
      .where(and(eq(pipelinesTable.clientId, clientId), eq(pipelinesTable.active, true)));

    const retentionPipeline = pipelines.find(
      (p) => p.name.toLowerCase().includes("retention") || p.name.toLowerCase().includes("health")
    );

    if (retentionPipeline) {
      console.log(`[health-retention] Triggering pipeline "${retentionPipeline.name}" for client ${clientId} (${previousTag} → ${tag})`);
      broadcastSSE("health-retention", {
        clientId,
        pipelineId: retentionPipeline.id,
        pipelineName: retentionPipeline.name,
        previousTag,
        newTag: tag,
        score,
        message: `Retention pipeline "${retentionPipeline.name}" triggered for client #${clientId}`,
      });
    }

    const [taskSession] = await db
      .insert(taskSessionsTable)
      .values({
        clientId,
        title: `[Auto] Client Health Alert: ${previousTag} → ${tag}`,
        objective: `Client health status changed from ${previousTag} to ${tag} (score: ${score}). Review engagement metrics and take retention action.`,
        status: "pending",
      })
      .returning();

    console.log(`[health-retention] Created retention task session #${taskSession.id} for client ${clientId}`);
  } catch (err) {
    console.error(`[health-retention] Failed retention trigger for client ${clientId}:`, errMsg(err));
  }
}

async function checkHealthScores() {
  const now = Date.now();
  if (now - lastHealthScoreCheck < HEALTH_SCORE_INTERVAL) return;
  lastHealthScoreCheck = now;

  try {
    const results = await computeAllHealthScores();
    const critical = results.filter((r) => r.tag === "critical");
    const atRisk = results.filter((r) => r.tag === "at_risk");

    for (const client of critical) {
      broadcastSSE("health-alert", {
        clientId: client.clientId,
        level: "critical",
        score: client.score,
        message: `CRITICAL: Client #${client.clientId} health score dropped to ${client.score}`,
      });
    }

    for (const client of atRisk) {
      broadcastSSE("health-alert", {
        clientId: client.clientId,
        level: "at_risk",
        score: client.score,
        message: `AT RISK: Client #${client.clientId} health score is ${client.score}`,
      });
    }

    const degraded = results.filter(
      (r) => r.transition && (r.tag === "at_risk" || r.tag === "critical") && r.previousTag
    );
    for (const client of degraded) {
      await triggerRetentionAction(client.clientId, client.tag, client.previousTag!, client.score);
    }

    console.log(`[scheduler] Health scores computed: ${results.length} clients (${critical.length} critical, ${atRisk.length} at-risk, ${degraded.length} transitions)`);
  } catch (err: unknown) {
    console.error(`[scheduler] Health score computation failed: ${errMsg(err)}`);
  }
}

let lastWeeklyPulseCheck = 0;
const WEEKLY_PULSE_INTERVAL = 7 * 24 * 60 * 60 * 1000;

async function checkWeeklyPulse() {
  const now = Date.now();
  if (now - lastWeeklyPulseCheck < WEEKLY_PULSE_INTERVAL) return;

  const today = new Date();
  if (today.getDay() !== 1) return;

  lastWeeklyPulseCheck = now;

  try {
    const pulse = await generateWeeklyPulse();

    await db.insert(backgroundReportsTable).values({
      botId: 0,
      assignmentId: 0,
      content: JSON.stringify(pulse, null, 2),
      summary: `Weekly Client Health Pulse: ${pulse.summary.critical} critical, ${pulse.summary.atRisk} at-risk, ${pulse.summary.healthy} healthy out of ${pulse.summary.total} clients`,
      runStatus: "success",
    });

    broadcastSSE("weekly-pulse", {
      type: "client_pulse",
      ...pulse,
    });

    for (const client of pulse.critical) {
      broadcastSSE("health-alert", {
        level: "pulse-critical",
        companyName: client.companyName,
        score: client.score,
        message: `Weekly Pulse: ${client.companyName} is CRITICAL (score: ${client.score}) — ${client.recommendedAction}`,
      });
    }

    console.log(`[scheduler] Weekly Client Pulse generated and persisted: ${pulse.summary.total} clients`);
  } catch (err: unknown) {
    console.error(`[scheduler] Weekly pulse generation failed: ${errMsg(err)}`);
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function tryAcquireSchedulerLock(): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [SCHEDULER_LOCK_ID],
    );
    return result.rows[0]?.acquired === true;
  } catch (err) {
    console.error("[scheduler] Failed to acquire advisory lock:", err);
    return false;
  }
}

let lastContentRescanCheck = 0;
const CONTENT_RESCAN_INTERVAL = 24 * 60 * 60 * 1000;

async function checkContentAeoRescans() {
  const now = Date.now();
  if (now - lastContentRescanCheck < CONTENT_RESCAN_INTERVAL) return;
  lastContentRescanCheck = now;

  try {
    const publishedContent = await db
      .select()
      .from(bingolingoContentTable)
      .where(and(
        eq(bingolingoContentTable.status, "published"),
        isNotNull(bingolingoContentTable.publishedUrl),
        isNotNull(bingolingoContentTable.publishedAt)
      ));

    const [partnerKey] = await db
      .select()
      .from(platformApiKeysTable)
      .where(and(eq(platformApiKeysTable.platform, "piratemonster_mcp"), eq(platformApiKeysTable.status, "active")))
      .limit(1);

    if (!partnerKey) return;

    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;

    for (const content of publishedContent) {
      if (!content.publishedAt || !content.publishedUrl) continue;

      const elapsed = now - new Date(content.publishedAt).getTime();
      const shouldRescan7 = elapsed >= SEVEN_DAYS && elapsed < SEVEN_DAYS + ONE_DAY;
      const shouldRescan30 = elapsed >= THIRTY_DAYS && elapsed < THIRTY_DAYS + ONE_DAY;

      if (shouldRescan7 || shouldRescan30) {
        const existing = await db
          .select()
          .from(aeoScanRequestsTable)
          .where(and(
            eq(aeoScanRequestsTable.url, content.publishedUrl),
            eq(aeoScanRequestsTable.status, "queued")
          ));

        if (existing.length === 0) {
          await db.insert(aeoScanRequestsTable).values({
            partnerKeyId: partnerKey.id,
            url: content.publishedUrl,
            status: "queued",
          });
          console.log(`[scheduler] Queued ${shouldRescan7 ? "7-day" : "30-day"} AEO re-scan for content #${content.id}: ${content.publishedUrl}`);
        }
      }
    }
  } catch (err: unknown) {
    console.error(`[scheduler] Content AEO re-scan check failed: ${errMsg(err)}`);
  }
}

const PARTNER_TIER_THRESHOLDS = {
  authorized: { minClients: 5, minMonthlySpend: 200 },
  certified: { minClients: 15, minMonthlySpend: 500 },
  elite: { minClients: 50, minMonthlySpend: 2000 },
};

let lastPartnerTierReview: Date | null = null;

async function checkPartnerTierCompliance() {
  const now = new Date();
  if (lastPartnerTierReview) {
    const daysSince = (now.getTime() - lastPartnerTierReview.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 28) return;
  }

  const partners = await db.select().from(partnersTable).where(eq(partnersTable.isActive, true));

  for (const partner of partners) {
    try {
      const referrals = await db
        .select()
        .from(partnerRegistrationsTable)
        .where(and(eq(partnerRegistrationsTable.partnerRef, partner.ref), eq(partnerRegistrationsTable.status, "active")));

      const activeCount = referrals.length;
      const tierKey = partner.tier as keyof typeof PARTNER_TIER_THRESHOLDS;
      const thresholds = PARTNER_TIER_THRESHOLDS[tierKey] ?? PARTNER_TIER_THRESHOLDS.authorized;

      const isBelowThreshold = activeCount < thresholds.minClients;
      const newConsecutive = isBelowThreshold ? partner.consecutiveMonthsBelowThreshold + 1 : 0;

      let action = "no_change";
      let newTier = partner.tier;

      if (isBelowThreshold && newConsecutive >= 2) {
        const tiers = ["elite", "certified", "authorized"];
        const currentIdx = tiers.indexOf(partner.tier);
        if (currentIdx < tiers.length - 1) {
          newTier = tiers[currentIdx + 1];
          action = "downgraded";
        }
      } else if (!isBelowThreshold) {
        action = "no_change";
      } else {
        action = "below_threshold_warning";
      }

      await db.insert(partnerTierReviewLogTable).values({
        partnerId: partner.id,
        partnerRef: partner.ref,
        activeClientCount: activeCount,
        monthlySpend: "0",
        tierAtReview: partner.tier,
        action,
        notes: isBelowThreshold
          ? `Active clients (${activeCount}) below minimum (${thresholds.minClients}) for ${newConsecutive} month(s)`
          : `Thresholds met with ${activeCount} active clients`,
      });

      await db
        .update(partnersTable)
        .set({
          tier: newTier,
          consecutiveMonthsBelowThreshold: newConsecutive,
          lastTierReviewAt: now,
        })
        .where(eq(partnersTable.id, partner.id));

      if (action === "downgraded") {
        console.log(`[scheduler] Partner ${partner.ref} downgraded from ${partner.tier} to ${newTier}`);
      }
    } catch (err) {
      console.error(`[scheduler] Error reviewing partner ${partner.ref}:`, err);
    }
  }

  lastPartnerTierReview = now;
  console.log(`[scheduler] Partner tier review complete for ${partners.length} partner(s)`);
}

export async function startScheduler() {
  if (schedulerInterval) return;

  const acquired = await tryAcquireSchedulerLock();
  if (!acquired) {
    console.log("[scheduler] Lock not acquired — another instance is running scheduled jobs");
    return;
  }

  console.log("[scheduler] Background autonomy scheduler started (checking every 5 minutes)");

  function handleTickError(label: string) {
    return (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("relation") && msg.includes("does not exist")) {
        console.error(
          `[scheduler] ${label}: Missing database table — ${msg}. ` +
          `Run 'pnpm --filter @workspace/db push' to create missing tables. Will retry next tick.`
        );
      } else {
        console.error(`[scheduler] Tick error (${label}):`, err);
      }
    };
  }

  schedulerInterval = setInterval(() => {
    checkDueAssignments().catch(handleTickError("assignments"));
    checkWeeklyBriefings().catch(handleTickError("weekly briefings"));
    checkCompetitorAlerts().catch(handleTickError("competitor alerts"));
    checkKnowledgeBaseSyncs().catch(handleTickError("KB sync"));
    checkBingolingoAutoContent().catch(handleTickError("BingoLingo auto-content"));
    checkContentAeoRescans().catch(handleTickError("content AEO re-scans"));
    checkHealthScores().catch(handleTickError("health scores"));
    checkWeeklyPulse().catch(handleTickError("weekly pulse"));
    checkPartnerTierCompliance().catch(handleTickError("partner tier review"));
  }, 5 * 60 * 1000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
