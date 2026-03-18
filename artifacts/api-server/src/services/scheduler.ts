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
  pendingApprovalsTable,
  approvalSlaConfigsTable,
  workflowsTable,
  workflowRunsTable,
} from "@workspace/db";
import { eq, and, lte, isNull, or, ne, desc, gt, isNotNull, count, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateWeeklyBriefing } from "./roi";
import { generateMorningBriefs, generateWeeklyBriefs } from "./briefing";
import { syncSource } from "./kb-sync";
import { runAgenticLoop, resumeAgenticLoopWithRejection } from "../tools/agentic-loop";
import type { ToolContext } from "../tools";
import { shouldPauseAutonomous } from "./cost-caps";
import { createNotification } from "./notifications";
import { computeAllHealthScores, generateWeeklyPulse } from "./client-health";
import nodemailer from "nodemailer";
import { executeWorkflow, checkWorkflowTriggers, resumeWorkflowRunFromDelay } from "./workflow-engine";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SCHEDULER_LOCK_ID = 999999;

const SCHEDULE_INTERVALS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export { addSSEClient, broadcastSSE } from "./sse";

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

const TIME_SENSITIVE_TOOLS = ["send_email", "create_invoice", "send_notification", "post_to_slack"];

export async function checkApprovalSLAs() {
  try {
    const now = new Date();
    const pendingApprovals = await db
      .select()
      .from(pendingApprovalsTable)
      .where(eq(pendingApprovalsTable.status, "pending"));

    if (pendingApprovals.length === 0) return;

    const clientIds = [...new Set(pendingApprovals.map((a) => a.clientId))];
    const slaConfigs = await db
      .select()
      .from(approvalSlaConfigsTable)
      .where(
        clientIds.length === 1
          ? eq(approvalSlaConfigsTable.clientId, clientIds[0])
          : inArray(approvalSlaConfigsTable.clientId, clientIds)
      );
    const slaConfigMap: Record<number, typeof slaConfigs[0]> = Object.fromEntries(
      slaConfigs.map((c) => [c.clientId, c])
    );

    for (const approval of pendingApprovals) {
      const config = slaConfigMap[approval.clientId];
      const isTimeSensitive = approval.isTimeSensitive || TIME_SENSITIVE_TOOLS.includes(approval.toolName);
      const slaMinutes = isTimeSensitive
        ? (config?.timeSensitiveSlaMinutes ?? 60)
        : (config?.defaultSlaMinutes ?? 240);

      let slaDeadline = approval.slaDeadline;
      if (!slaDeadline) {
        slaDeadline = new Date(approval.createdAt.getTime() + slaMinutes * 60 * 1000);
        await db
          .update(pendingApprovalsTable)
          .set({ slaDeadline, isTimeSensitive })
          .where(eq(pendingApprovalsTable.id, approval.id));
      }

      if (now < slaDeadline) continue;

      const doubleDeadline = new Date(slaDeadline.getTime() + slaMinutes * 60 * 1000);

      if (now >= doubleDeadline) {
        const updated = await db
          .update(pendingApprovalsTable)
          .set({
            status: "rejected",
            resolvedAt: now,
            rejectionReason: "SLA timeout — rejected automatically",
          })
          .where(and(eq(pendingApprovalsTable.id, approval.id), eq(pendingApprovalsTable.status, "pending")))
          .returning();

        if (updated.length === 0) continue;

        const rejectionReason = "SLA timeout — rejected automatically";

        const pausedCtx = approval.pausedLoopContext as {
          model: string;
          maxIterations: number;
          maxTokens: number;
          systemPrompt: string;
          messages: unknown[];
          remainingIterations: number;
          toolCallId: string;
          allToolCallIds?: string[];
        } | null;

        if (pausedCtx) {
          const toolContext: ToolContext = {
            clientId: approval.clientId,
            botId: approval.botId,
            botName: approval.botName ?? undefined,
            sessionId: approval.sessionId ?? undefined,
            conversationId: approval.conversationId ?? undefined,
          };
          resumeAgenticLoopWithRejection({
            pausedLoopContext: pausedCtx,
            toolName: approval.toolName,
            rejectionReason,
            context: toolContext,
          }).catch((e) => console.error("[sla] Failed to resume agentic loop after SLA rejection:", e));
        }

        createNotification({
          clientId: approval.clientId,
          category: "system",
          severity: "critical",
          title: "Approval auto-rejected (SLA timeout)",
          body: `${approval.botName ?? "Bot"}'s request to use "${approval.toolName}" was auto-rejected after ${slaMinutes * 2} minutes without a decision.`,
          link: "/command-center",
          metadata: { approvalId: approval.id, toolName: approval.toolName },
        }).catch((e) => console.error("[sla] Failed to create auto-reject notification:", e));

        broadcastSSE("activity", {
          id: `sla-reject-${approval.id}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          clientId: approval.clientId,
          source: "system",
          eventType: "approval",
          severity: "critical",
          title: "Approval auto-rejected (SLA timeout)",
          description: `Tool "${approval.toolName}" request was auto-rejected after ${slaMinutes * 2} minutes`,
          metadata: { approvalId: approval.id, toolName: approval.toolName, reason: rejectionReason },
        });

        broadcastSSE("approval-sla-rejected", {
          clientId: approval.clientId,
          approvalId: approval.id,
          toolName: approval.toolName,
          reason: rejectionReason,
        });
      } else if (!approval.escalatedAt) {
        await db
          .update(pendingApprovalsTable)
          .set({ escalatedAt: now })
          .where(eq(pendingApprovalsTable.id, approval.id));

        createNotification({
          clientId: approval.clientId,
          category: "system",
          severity: "critical",
          title: "Approval SLA breached — action required",
          body: `${approval.botName ?? "Bot"}'s request to use "${approval.toolName}" is overdue. Auto-reject in ${slaMinutes} minutes if not resolved.`,
          link: "/command-center",
          metadata: { approvalId: approval.id, toolName: approval.toolName },
        }).catch((e) => console.error("[sla] Failed to create SLA breach notification:", e));

        broadcastSSE("approval-sla-breached", {
          clientId: approval.clientId,
          approvalId: approval.id,
          toolName: approval.toolName,
          slaDeadline: slaDeadline.toISOString(),
          secondaryApproverEmail: config?.secondaryApproverEmail ?? null,
        });

        if (config?.secondaryApproverEmail) {
          const smtpUser = process.env.SMTP_USER;
          const smtpPass = process.env.SMTP_PASS;
          if (smtpUser && smtpPass) {
            const transporter = nodemailer.createTransport({
              host: process.env.SMTP_HOST ?? "smtp.gmail.com",
              port: Number(process.env.SMTP_PORT ?? 587),
              secure: false,
              auth: { user: smtpUser, pass: smtpPass },
            });
            transporter.sendMail({
              from: `"GalaxyBots" <${smtpUser}>`,
              to: config.secondaryApproverEmail,
              subject: `[Action Required] Approval SLA breached for ${approval.toolName}`,
              text: [
                `An approval request is overdue and has been escalated to you.`,
                ``,
                `Bot: ${approval.botName ?? "Unknown"}`,
                `Tool: ${approval.toolName}`,
                `Tool input: ${typeof approval.toolInput === "object" ? JSON.stringify(approval.toolInput) : (approval.toolInput ?? "No input provided")}`,
                `SLA deadline: ${slaDeadline.toISOString()}`,
                `Auto-reject in: ${slaMinutes} minutes`,
                ``,
                `Please review at: ${process.env.APP_URL ?? "https://galaxybots.app"}/command-center`,
              ].join("\n"),
            }).catch((e: Error) => console.error("[sla] Failed to send escalation email:", e));
          } else {
            console.warn("[sla] Escalation email skipped — SMTP_USER/SMTP_PASS not configured");
          }
        }
      }
    }
  } catch (err) {
    console.error("[sla] Error checking approval SLAs:", err);
  }
}

function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true;
  if (field.includes(",")) return field.split(",").some((f) => matchesCronField(f.trim(), value));
  if (field.includes("-")) {
    const [lo, hi] = field.split("-").map(Number);
    return value >= lo && value <= hi;
  }
  if (field.includes("/")) {
    const [base, step] = field.split("/");
    const stepNum = Number(step);
    const start = base === "*" ? 0 : Number(base);
    return value >= start && (value - start) % stepNum === 0;
  }
  return Number(field) === value;
}

function cronDueInWindow(cron: string, since: Date, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minuteF, hourF, domF, monthF, dowF] = parts;
  const windowMs = now.getTime() - since.getTime();
  const steps = Math.max(1, Math.ceil(windowMs / 60000));
  for (let i = 0; i < steps; i++) {
    const t = new Date(now.getTime() - i * 60000);
    if (
      matchesCronField(minuteF, t.getMinutes()) &&
      matchesCronField(hourF, t.getHours()) &&
      matchesCronField(domF, t.getDate()) &&
      matchesCronField(monthF, t.getMonth() + 1) &&
      matchesCronField(dowF, t.getDay())
    ) {
      return true;
    }
  }
  return false;
}

async function checkScheduledWorkflows() {
  const now = new Date();

  const workflows = await db
    .select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.enabled, true), eq(workflowsTable.triggerType, "schedule")));

  for (const workflow of workflows) {
    const config = (workflow.triggerConfig ?? {}) as Record<string, unknown>;
    const cron = (config.cron ?? config.cronExpression) as string | undefined;
    const intervalMinutes = Number(config.intervalMinutes ?? 0);

    const lastRun = workflow.lastRunAt;
    let shouldRun = false;

    if (cron) {
      const checkSince = lastRun ?? workflow.createdAt;
      shouldRun = cronDueInWindow(cron, checkSince, now);
      if (lastRun) {
        const msSinceLast = now.getTime() - lastRun.getTime();
        const minsBetween = msSinceLast / 60000;
        if (minsBetween < 59) shouldRun = false;
      }
    } else if (intervalMinutes > 0) {
      const nextRun = lastRun
        ? new Date(lastRun.getTime() + intervalMinutes * 60 * 1000)
        : new Date(workflow.createdAt.getTime());
      shouldRun = now >= nextRun;
    }

    if (shouldRun) {
      executeWorkflow(workflow.id, "schedule", { scheduledAt: now.toISOString(), cron: cron ?? null }).catch((err) => {
        console.error(`[scheduler] Scheduled workflow ${workflow.id} failed:`, err);
      });
    }
  }
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

  async function resumePausedWorkflows() {
    const now = new Date();
    const pausedRuns = await db
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.status, "paused"));

    for (const run of pausedRuns) {
      const logEntries = (run.log ?? []) as Array<Record<string, unknown>>;
      const resumeEntry = logEntries.find((e) => e.type === "delay_resume");
      if (!resumeEntry) continue;

      const resumeAt = new Date(resumeEntry.resumeAt as string);
      if (now < resumeAt) continue;

      const remainingNodeIds = resumeEntry.remainingNodeIds as string[];
      const variables = (resumeEntry.variables ?? {}) as Record<string, unknown>;
      const payload = (resumeEntry.payload ?? {}) as Record<string, unknown>;

      const [workflow] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, run.workflowId));
      if (!workflow || !workflow.enabled) {
        await db.update(workflowRunsTable).set({ status: "failed", completedAt: now }).where(eq(workflowRunsTable.id, run.id));
        continue;
      }

      if (remainingNodeIds.length === 0) {
        const completedLog = logEntries.filter((e) => e.type !== "delay_resume");
        await db.update(workflowRunsTable).set({
          status: "done",
          completedAt: now,
          log: completedLog,
        }).where(eq(workflowRunsTable.id, run.id));
        continue;
      }

      const priorLog = logEntries.filter((e) => e.type !== "delay_resume");
      await db.update(workflowRunsTable).set({
        status: "running",
        log: priorLog,
      }).where(eq(workflowRunsTable.id, run.id));

      resumeWorkflowRunFromDelay(run.id, run.workflowId, remainingNodeIds[0], payload, priorLog)
        .catch((e) => console.error(`[scheduler] Failed to resume paused workflow run ${run.id}:`, e));
    }
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
    generateMorningBriefs().catch(handleTickError("morning intelligence briefs"));
    generateWeeklyBriefs().catch(handleTickError("weekly intelligence briefs"));
    checkApprovalSLAs().catch(handleTickError("approval SLAs"));
    checkScheduledWorkflows().catch(handleTickError("scheduled workflows"));
    resumePausedWorkflows().catch(handleTickError("resume paused workflows"));
  }, 5 * 60 * 1000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
