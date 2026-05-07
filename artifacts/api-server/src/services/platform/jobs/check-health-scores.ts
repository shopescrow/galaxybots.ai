import {
  db,
  pipelinesTable,
  taskSessionsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { broadcastSSE } from "../sse";
import { computeAllHealthScores } from "../../clients/client-health";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
        objective: `[Auto] Client Health Alert: ${previousTag} → ${tag} — Client health status changed from ${previousTag} to ${tag} (score: ${score}). Review engagement metrics and take retention action.`,
        status: "pending",
      })
      .returning();

    console.log(`[health-retention] Created retention task session #${taskSession.id} for client ${clientId}`);
  } catch (err) {
    console.error(`[health-retention] Failed retention trigger for client ${clientId}:`, errMsg(err));
  }
}

export async function checkHealthScores() {
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
