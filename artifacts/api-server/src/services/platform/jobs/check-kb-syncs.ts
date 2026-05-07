import { db, knowledgeBaseSourcesTable } from "@workspace/db";
import { ne, and } from "drizzle-orm";
import { syncSource } from "../../content/kb-sync";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SCHEDULE_INTERVALS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export async function checkKnowledgeBaseSyncs() {
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
