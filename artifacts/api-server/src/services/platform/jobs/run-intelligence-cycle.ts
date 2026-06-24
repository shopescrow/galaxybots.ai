import { db, clientsTable, intelligenceCycleRunsTable } from "@workspace/db";
import { eq, desc, isNull } from "drizzle-orm";
import { runIntelligenceCycle } from "../../intelligence/intelligence-cycle";

const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

async function getLastCycleRanAt(clientId: number | null): Promise<Date | null> {
  try {
    const filter = clientId !== null
      ? eq(intelligenceCycleRunsTable.clientId, clientId)
      : isNull(intelligenceCycleRunsTable.clientId);

    const [last] = await db
      .select({ ranAt: intelligenceCycleRunsTable.ranAt })
      .from(intelligenceCycleRunsTable)
      .where(filter)
      .orderBy(desc(intelligenceCycleRunsTable.ranAt))
      .limit(1);

    return last?.ranAt ?? null;
  } catch {
    return null;
  }
}

export async function runWeeklyIntelligenceCycles(): Promise<void> {
  const now = Date.now();

  try {
    const clients = await db
      .select({ id: clientsTable.id })
      .from(clientsTable);

    for (const client of clients) {
      try {
        const lastRan = await getLastCycleRanAt(client.id);
        if (lastRan && now - lastRan.getTime() < WEEKLY_MS) {
          continue;
        }

        await runIntelligenceCycle(client.id, 7, "scheduled");
      } catch (err) {
        console.error(`[IntelligenceCycleJob] Client ${client.id} cycle failed:`, err);
      }
    }
  } catch (err) {
    console.error("[IntelligenceCycleJob] Weekly intelligence cycle job failed:", err);
  }
}
