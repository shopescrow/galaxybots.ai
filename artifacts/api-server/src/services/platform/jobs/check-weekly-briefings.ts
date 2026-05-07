import { db, clientsTable } from "@workspace/db";
import { broadcastSSE } from "../sse";
import { createNotification } from "../../admin/notifications";
import { generateWeeklyBriefing } from "../../analytics/roi";
import { getTzLocalDay, getTzLocalHour } from "../../bots/briefing";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const BRIEFING_DELIVERY_HOUR = 9;
const sentThisWeek = new Set<number>();
let lastWeekReset = 0;

export async function checkWeeklyBriefings() {
  const now = Date.now();
  if (now - lastWeekReset > 7 * 24 * 60 * 60 * 1000) {
    sentThisWeek.clear();
    lastWeekReset = now;
  }

  try {
    const clients = await db.select().from(clientsTable);
    for (const client of clients) {
      if (sentThisWeek.has(client.id)) continue;

      const tz = client.timezone || "UTC";
      if (getTzLocalDay(tz) !== 1) continue;
      if (getTzLocalHour(tz) !== BRIEFING_DELIVERY_HOUR) continue;

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
        sentThisWeek.add(client.id);
      } catch (err: unknown) {
        console.error(`[scheduler] Error for client ${client.id}: ${errMsg(err)}`);
      }
    }
  } catch (err: unknown) {
    console.error(`[scheduler] Weekly briefing check failed: ${errMsg(err)}`);
  }
}
