import { db, guardianStateTable, guardianIncidentsTable, guardianWorkersTable, guardianPostmortemsTable, guardianPatrolsTable } from "@workspace/db";
import { eq, and, isNull, lt, gt, inArray, sql, desc } from "drizzle-orm";
import { dispatchSwarm, dispatchBee } from "./worker-bees";
import { getBeesForDomain } from "./bee-types";
import type { BeeType, ThreatBrief, BeeFinding } from "./bee-types";
import { broadcastSSEToAll } from "../platform/sse";
import { openai } from "@workspace/integrations-openai-ai-server";
import { registerDynamicJob } from "../platform/guardian-dynamic-jobs";
import { selectStrategy, recordStrategyRun } from "../conductor/galaxy-conductor";

let swarmLoopInterval: ReturnType<typeof setInterval> | null = null;
let lastSwarmCycleAt: Date | null = null;
let isSwarmingActive = false;

export function getIsSwarmingActive(): boolean {
  return isSwarmingActive;
}

export async function getQueenState(): Promise<{ mode: string; lastSwarmCycleAt: Date | null; isSwarming: boolean }> {
  const [state] = await db
    .insert(guardianStateTable)
    .values({ singletonKey: 1, mode: "active" })
    .onConflictDoUpdate({
      target: guardianStateTable.singletonKey,
      set: { updatedAt: new Date() },
    })
    .returning();
  return { mode: state.mode, lastSwarmCycleAt: state.lastSwarmCycleAt ?? null, isSwarming: isSwarmingActive };
}

export async function setQueenMode(mode: "active" | "paused" | "shutdown", pausedByUserId?: number): Promise<void> {
  await db
    .insert(guardianStateTable)
    .values({
      singletonKey: 1,
      mode,
      pausedByUserId: mode !== "active" ? (pausedByUserId ?? null) : null,
      pausedAt: mode !== "active" ? new Date() : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: guardianStateTable.singletonKey,
      set: {
        mode,
        pausedByUserId: mode !== "active" ? (pausedByUserId ?? null) : null,
        pausedAt: mode !== "active" ? new Date() : null,
        updatedAt: new Date(),
      },
    });
  broadcastSSEToAll("guardian_mode_change", { mode, changedAt: new Date().toISOString() });
}

async function updateLastSwarmCycle(): Promise<void> {
  lastSwarmCycleAt = new Date();
  await db
    .update(guardianStateTable)
    .set({ lastSwarmCycleAt: lastSwarmCycleAt, updatedAt: new Date() })
    .where(sql`1=1`);
}

async function synthesiseReport(findings: BeeFinding[]): Promise<string> {
  const summary = findings
    .map((f) => `[${f.beeType.toUpperCase()}] ${f.finding} | Fix: ${f.proposedFix} | Confidence: ${(f.confidenceScore * 100).toFixed(0)}%`)
    .join("\n");
  return summary;
}

async function generatePostmortem(incidentId: number): Promise<void> {
  try {
    const [incident] = await db.select().from(guardianIncidentsTable).where(eq(guardianIncidentsTable.id, incidentId));
    if (!incident) return;

    const workers = await db.select().from(guardianWorkersTable).where(eq(guardianWorkersTable.incidentId, incidentId));
    const timelineLines = workers
      .filter((w) => w.completedAt)
      .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0))
      .map((w) => `${w.beeType}: ${w.finding ?? "no finding"}`)
      .join("; ");

    const prompt = `Generate a structured post-mortem report for a platform incident.

Incident: ${incident.title}
Domain: ${incident.domain}
Severity: ${incident.severity}/100
Blast Radius: ${incident.blastRadius}/100
Affected Component: ${incident.affectedComponent ?? "unknown"}
Description: ${incident.description}
Timeline of bee findings: ${timelineLines || "none"}

Return a JSON object with exactly these keys:
- triggerEvent (string)
- detectionTime (string)
- blastRadiusSummary (string)
- timeline (string)
- rootCause (string)
- appliedRemedy (string)
- preventionRecommendation (string)

Format for KiloPro SOC 2 / GDPR audit compatibility. Be precise and technical.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: "You are the Guardian Queen's post-mortem analyst. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, string>;

    await db.insert(guardianPostmortemsTable).values({
      incidentId,
      triggerEvent: parsed.triggerEvent ?? incident.title,
      detectionTime: parsed.detectionTime ?? new Date().toISOString(),
      blastRadiusSummary: parsed.blastRadiusSummary ?? `Blast radius score: ${incident.blastRadius}`,
      timeline: parsed.timeline ?? timelineLines,
      rootCause: parsed.rootCause ?? "Under investigation",
      appliedRemedy: parsed.appliedRemedy ?? "Pending manual intervention",
      preventionRecommendation: parsed.preventionRecommendation ?? "Review and harden affected component",
      kiloProCompatible: "yes",
    });

    broadcastSSEToAll("guardian_postmortem_created", { incidentId, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error("[QueenOrchestrator] Post-mortem generation failed:", err);
  }
}

async function checkRecurrenceAndCreatePatrol(incident: { id: number; domain: string; errorFingerprint: string | null; title: string }): Promise<void> {
  if (!incident.errorFingerprint) return;
  try {
    const fingerprint = incident.errorFingerprint;
    const [existing] = await db
      .select()
      .from(guardianPatrolsTable)
      .where(and(eq(guardianPatrolsTable.domain, incident.domain), eq(guardianPatrolsTable.triggerPattern, fingerprint)))
      .limit(1);

    if (existing) {
      await db
        .update(guardianPatrolsTable)
        .set({ recurrenceCount: existing.recurrenceCount + 1, lastTriggeredAt: new Date() })
        .where(eq(guardianPatrolsTable.id, existing.id));
    } else {
      const similarCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(guardianIncidentsTable)
        .where(and(eq(guardianIncidentsTable.domain, incident.domain), eq(guardianIncidentsTable.errorFingerprint, fingerprint)));

      const count = Number(similarCount[0]?.count ?? 0);
      if (count >= 2) {
        const patrolName = `patrol_${incident.domain}_${fingerprint.slice(0, 12)}`;
        const jobName = `guardian-patrol-${patrolName}`;
        await db.insert(guardianPatrolsTable).values({
          name: patrolName,
          domain: incident.domain,
          triggerPattern: fingerprint,
          schedulerJobName: jobName,
          recurrenceCount: count,
          isActive: "active",
          lastTriggeredAt: new Date(),
        });

        const capturedFingerprint = fingerprint;
        const capturedDomain = incident.domain;
        registerDynamicJob(jobName, async () => {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const [recent] = await db
            .select({ count: sql<number>`count(*)` })
            .from(guardianIncidentsTable)
            .where(
              and(
                eq(guardianIncidentsTable.domain, capturedDomain),
                eq(guardianIncidentsTable.errorFingerprint, capturedFingerprint),
                gt(guardianIncidentsTable.createdAt, oneHourAgo),
              ),
            );
          const recentCount = Number(recent?.count ?? 0);
          if (recentCount > 0) {
            console.log(`[GuardianPatrol:${jobName}] Pattern "${capturedFingerprint}" still recurring (${recentCount} in last hour) — triggering swarm`);
            runSwarmCycle().catch(() => {});
          }
        });

        broadcastSSEToAll("guardian_patrol_created", { domain: incident.domain, patrolName, jobName, createdAt: new Date().toISOString() });
      }
    }
  } catch (err) {
    console.error("[QueenOrchestrator] Patrol check failed:", err);
  }
}

export async function runSwarmCycle(): Promise<void> {
  if (isSwarmingActive) return;
  try {
    const { mode } = await getQueenState();
    if (mode !== "active") return;

    const claimed = await db.transaction(async (tx) => {
      const candidates = await tx
        .select()
        .from(guardianIncidentsTable)
        .where(and(eq(guardianIncidentsTable.status, "open"), isNull(guardianIncidentsTable.resolvedAt)))
        .orderBy(desc(sql<number>`(${guardianIncidentsTable.severity} * ${guardianIncidentsTable.blastRadius} * (1 + ${guardianIncidentsTable.recurrenceRate}))`))
        .limit(5)
        .for("update", { skipLocked: true });

      if (candidates.length === 0) return [];

      await tx
        .update(guardianIncidentsTable)
        .set({ status: "claimed", updatedAt: new Date() })
        .where(inArray(guardianIncidentsTable.id, candidates.map((c) => c.id)));

      return candidates;
    });

    if (claimed.length === 0) {
      await updateLastSwarmCycle();
      return;
    }

    isSwarmingActive = true;
    await updateLastSwarmCycle();
    broadcastSSEToAll("guardian_swarm_start", { incidentCount: claimed.length, isSwarming: true, at: new Date().toISOString() });

    for (const incident of claimed) {
      const beeTypes = getBeesForDomain(incident.domain);
      const brief: ThreatBrief = {
        domain: incident.domain,
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        affectedComponent: incident.affectedComponent ?? undefined,
        sourcePayload: incident.sourcePayload,
        incidentId: incident.id,
      };

      await db
        .update(guardianIncidentsTable)
        .set({ status: "investigating", updatedAt: new Date() })
        .where(eq(guardianIncidentsTable.id, incident.id));

      const workerIds: number[] = [];
      for (const bt of beeTypes) {
        const [worker] = await db
          .insert(guardianWorkersTable)
          .values({ incidentId: incident.id, beeType: bt, status: "dispatched" })
          .returning();
        workerIds.push(worker.id);
      }

      broadcastSSEToAll("guardian_bees_dispatched", { incidentId: incident.id, beeTypes, at: new Date().toISOString() });

      const conductorAgents = beeTypes.map((bt) => ({ name: bt }));
      const conductorSelection = await selectStrategy(
        `incident_response: ${incident.title} — ${incident.description.slice(0, 300)}`,
        conductorAgents,
        "incident_response",
      ).catch(() => null);

      let orderedBeeTypes = beeTypes;
      let conductorStrategyId = -1;

      if (conductorSelection) {
        conductorStrategyId = await recordStrategyRun(
          conductorSelection,
          beeTypes,
          0,
          undefined,
          `incident:${incident.id}`,
          "guardian_swarm",
        );

        broadcastSSEToAll("guardian_conductor_strategy", {
          incidentId: incident.id,
          strategy: conductorSelection.strategy,
          rationale: conductorSelection.rationale,
          at: new Date().toISOString(),
        });

        if (conductorSelection.strategy === "sequential_debate") {
          const priority: BeeType[] = ["debug", "security", "compliance", "performance", "ai_safety", "data_integrity", "client_health", "dependency", "prediction"];
          orderedBeeTypes = [
            ...priority.filter((p) => beeTypes.includes(p)),
            ...beeTypes.filter((b) => !priority.includes(b as BeeType)),
          ];
        } else if (conductorSelection.strategy === "hierarchical_delegation") {
          const leadBee = beeTypes.includes("debug") ? "debug"
            : beeTypes.includes("security") ? "security"
            : beeTypes[0];
          if (leadBee) {
            orderedBeeTypes = [leadBee, ...beeTypes.filter((b) => b !== leadBee)];
          }
        }
      }

      const findings = await dispatchSwarm(orderedBeeTypes, brief);

      const avgConfidence = findings.length > 0
        ? findings.reduce((sum, f) => sum + f.confidenceScore, 0) / findings.length
        : 0;

      if (conductorSelection && conductorStrategyId >= 0) {
        const { recordStrategyOutcome } = await import("../conductor/galaxy-conductor");
        recordStrategyOutcome(conductorStrategyId, avgConfidence).catch(() => {});
      }

      for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        const workerId = workerIds[i];
        if (workerId) {
          await db
            .update(guardianWorkersTable)
            .set({
              status: "complete",
              finding: f.finding,
              rootCause: f.rootCause,
              proposedFix: f.proposedFix,
              confidenceScore: f.confidenceScore,
              rawResponse: f as unknown as Record<string, unknown>,
              completedAt: new Date(),
            })
            .where(eq(guardianWorkersTable.id, workerId));
        }
      }

      const report = await synthesiseReport(findings);

      await db
        .update(guardianIncidentsTable)
        .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
        .where(eq(guardianIncidentsTable.id, incident.id));

      generateAndStoreEmbedding(incident.id, incident.title, incident.description, incident.domain).catch(() => {});

      broadcastSSEToAll("guardian_incident_resolved", {
        incidentId: incident.id,
        domain: incident.domain,
        severity: incident.severity,
        summary: report.slice(0, 500),
        at: new Date().toISOString(),
      });

      if (incident.severity >= 70) {
        await generatePostmortem(incident.id);
        await pushToKiloPro(incident, report);
      }

      await checkRecurrenceAndCreatePatrol(incident);
    }

    await updateLastSwarmCycle();
  } catch (err) {
    console.error("[QueenOrchestrator] Swarm cycle error:", err);
  } finally {
    isSwarmingActive = false;
    broadcastSSEToAll("guardian_swarm_end", { isSwarming: false, at: new Date().toISOString() });
  }
}

async function pushToKiloPro(incident: { id: number; domain: string; title: string; severity: number }, report: string): Promise<void> {
  try {
    const COMPLIANCE_API_KEY = process.env["COMPLIANCE_API_KEY"];
    const KILOPRO_PUSH_URL = process.env["KILOPRO_PUSH_URL"];
    if (!COMPLIANCE_API_KEY || !KILOPRO_PUSH_URL) return;

    const complianceStatus =
      incident.severity >= 70 ? "non_compliant" :
      incident.severity >= 50 ? "at_risk" : "compliant";

    const body = {
      standardName: `Guardian Incident #${incident.id}: ${incident.title}`,
      category: incident.domain,
      status: complianceStatus,
      details: report.slice(0, 2000),
      issuedBy: "GalaxyBots Guardian Queen",
      compliancePlatform: "kilopro",
      incidentSeverity: incident.severity,
      kiloProAuditTag: `guardian:incident:${incident.id}:${complianceStatus}`,
    };

    await fetch(KILOPRO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": COMPLIANCE_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("[QueenOrchestrator] KiloPro push failed:", err);
  }
}

async function rehydratePatrolJobs(): Promise<void> {
  try {
    const activePatrols = await db
      .select()
      .from(guardianPatrolsTable)
      .where(eq(guardianPatrolsTable.isActive, "active"));

    if (activePatrols.length === 0) return;

    for (const patrol of activePatrols) {
      const jobName = patrol.schedulerJobName ?? `guardian-patrol-${patrol.name}`;
      const capturedFingerprint = patrol.triggerPattern;
      const capturedDomain = patrol.domain;

      registerDynamicJob(jobName, async () => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const [recent] = await db
          .select({ count: sql<number>`count(*)` })
          .from(guardianIncidentsTable)
          .where(
            and(
              eq(guardianIncidentsTable.domain, capturedDomain),
              eq(guardianIncidentsTable.errorFingerprint, capturedFingerprint),
              gt(guardianIncidentsTable.createdAt, oneHourAgo),
            ),
          );
        if (Number(recent?.count ?? 0) > 0) {
          runSwarmCycle().catch(() => {});
        }
      });
    }

    console.log(`[GuardianQueen] Rehydrated ${activePatrols.length} standing patrol job(s) from DB`);
  } catch (err) {
    console.error("[GuardianQueen] Patrol rehydration failed:", err);
  }
}

async function checkOllamaHealthAndAlert(): Promise<void> {
  try {
    const { checkOllamaHealth, getOllamaConfig } = await import("../../agent-core/adapters/ollama-adapter.js");
    const config = getOllamaConfig();
    if (!config.enabled) return;

    const healthy = await checkOllamaHealth();
    if (!healthy) {
      console.warn("[GuardianQueen] Ollama health check failed — local model tier degraded, falling back to EFFICIENT tier");
      await db.insert(guardianIncidentsTable).values({
        title: "Local Model Router (Ollama) Unreachable",
        description: `The Ollama local model server at ${config.host} is not responding. Coordinator and conductor calls are falling back to the EFFICIENT cloud tier. To restore local routing, ensure Ollama is running with the ${config.model} model loaded.`,
        domain: "ai_infrastructure",
        severity: 35,
        blastRadius: 20,
        status: "open",
        affectedComponent: "ollama_adapter",
        errorFingerprint: "ollama_health_check_failed",
        recurrenceRate: 0,
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[GuardianQueen] Ollama health check error:", err);
  }
}

export async function startQueenSwarmLoop(): Promise<void> {
  if (swarmLoopInterval) return;

  checkOllamaHealthAndAlert().catch(() => {});

  const { mode } = await getQueenState();
  if (mode === "shutdown") {
    console.log("[GuardianQueen] Startup suppressed — shutdown mode persisted");
    return;
  }

  if (mode === "paused") {
    console.log("[GuardianQueen] Starting in paused state — waiting for resume");
  } else {
    console.log("[GuardianQueen] Colony awakens — swarm loop starting");
  }

  rehydratePatrolJobs().catch((err) => console.error("[GuardianQueen] Patrol rehydration error:", err));

  swarmLoopInterval = setInterval(() => {
    runSwarmCycle().catch((err) => console.error("[GuardianQueen] Swarm loop error:", err));
  }, 2 * 60 * 1000);

  runSwarmCycle().catch((err) => console.error("[GuardianQueen] Initial swarm cycle error:", err));
}

export async function guardianHeartbeat(): Promise<void> {
  try {
    const { mode, lastSwarmCycleAt: lastCycle } = await getQueenState();
    if (mode !== "active") return;

    const staleThresholdMs = 5 * 60 * 1000;
    const now = Date.now();
    const isStale = !lastCycle || now - lastCycle.getTime() > staleThresholdMs;

    if (isStale) {
      console.log("[GuardianQueen] Heartbeat detected stale swarm — resurrecting");

      await db
        .update(guardianWorkersTable)
        .set({ status: "zombie_cleared", completedAt: new Date() })
        .where(eq(guardianWorkersTable.status, "dispatched"));

      const requeued = await db
        .update(guardianIncidentsTable)
        .set({ status: "open", updatedAt: new Date() })
        .where(
          and(
            sql`status IN ('claimed', 'investigating')`,
            isNull(guardianIncidentsTable.resolvedAt),
          ),
        )
        .returning({ id: guardianIncidentsTable.id });

      if (requeued.length > 0) {
        console.log(`[GuardianQueen] Heartbeat requeued ${requeued.length} stale in-flight incident(s) back to open`);
      }

      isSwarmingActive = false;

      broadcastSSEToAll("guardian_resurrection", { at: new Date().toISOString(), reason: "heartbeat_stale_detected", requeuedCount: requeued.length });

      if (!swarmLoopInterval) {
        swarmLoopInterval = setInterval(() => {
          runSwarmCycle().catch((err) => console.error("[GuardianQueen] Resurrected swarm error:", err));
        }, 2 * 60 * 1000);
      }

      await runSwarmCycle();
    }
  } catch (err) {
    console.error("[GuardianQueen] Heartbeat error:", err);
  }
}

export function stopQueenSwarmLoop(): void {
  if (swarmLoopInterval) {
    clearInterval(swarmLoopInterval);
    swarmLoopInterval = null;
  }
}

async function generateAndStoreEmbedding(incidentId: number, title: string, description: string, domain: string): Promise<void> {
  try {
    const text = `[${domain}] ${title}\n${description}`.slice(0, 8000);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 1536,
    });
    const vector = response.data[0]?.embedding;
    if (!vector || vector.length !== 1536) return;
    await db
      .update(guardianIncidentsTable)
      .set({ embedding: vector })
      .where(eq(guardianIncidentsTable.id, incidentId));
  } catch (err) {
    console.error("[GuardianQueen] Embedding generation failed:", err);
  }
}

export async function runActivePatrols(): Promise<void> {
  try {
    const { mode } = await getQueenState();
    if (mode !== "active") return;

    const patrols = await db
      .select()
      .from(guardianPatrolsTable)
      .where(eq(guardianPatrolsTable.isActive, "active"))
      .limit(20);

    for (const patrol of patrols) {
      const recentMatch = await db
        .select({ count: sql<number>`count(*)` })
        .from(guardianIncidentsTable)
        .where(
          and(
            eq(guardianIncidentsTable.domain, patrol.domain),
            eq(guardianIncidentsTable.errorFingerprint, patrol.triggerPattern),
            isNull(guardianIncidentsTable.resolvedAt)
          )
        );
      const openCount = Number(recentMatch[0]?.count ?? 0);
      if (openCount > 0) {
        await db
          .update(guardianPatrolsTable)
          .set({ recurrenceCount: patrol.recurrenceCount + 1, lastTriggeredAt: new Date() })
          .where(eq(guardianPatrolsTable.id, patrol.id));
        broadcastSSEToAll("guardian_patrol_triggered", { patrolId: patrol.id, name: patrol.name, domain: patrol.domain, at: new Date().toISOString() });
      }
    }
  } catch (err) {
    console.error("[GuardianQueen] Patrol run error:", err);
  }
}
