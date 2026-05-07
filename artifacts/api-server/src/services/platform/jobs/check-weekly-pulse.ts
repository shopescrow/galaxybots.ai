import { db, backgroundReportsTable, clientsTable } from "@workspace/db";
import { broadcastSSE } from "../sse";
import { generateWeeklyPulse } from "../../clients/client-health";
import { getTzLocalDay, getTzLocalHour } from "../../bots/briefing";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let lastPulseWeekKey = "";

function currentIsoWeek(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

const PULSE_DELIVERY_HOUR = 8;

export async function checkWeeklyPulse() {
  const weekKey = currentIsoWeek();
  if (weekKey === lastPulseWeekKey) return;

  const clients = await db
    .select({ id: clientsTable.id, timezone: clientsTable.timezone })
    .from(clientsTable);

  const anyReady = clients.some((c) => {
    const tz = c.timezone || "UTC";
    return getTzLocalDay(tz) === 1 && getTzLocalHour(tz) >= PULSE_DELIVERY_HOUR;
  });

  if (!anyReady) return;

  lastPulseWeekKey = weekKey;

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
