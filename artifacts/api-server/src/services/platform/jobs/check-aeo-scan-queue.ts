import { db, aeoScanRequestsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { dispatchScanToPirateMonster } from "../../partner/piratemonster-client";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SCAN_QUEUE_BATCH = 10;

export async function checkAeoScanQueue() {
  const apiKey = process.env["PIRATEMONSTER_API_KEY"] || "";
  const apiBase = process.env["PIRATEMONSTER_API_BASE_URL"] || "";
  if (!apiKey || !apiBase) return;

  const queued = await db
    .select()
    .from(aeoScanRequestsTable)
    .where(eq(aeoScanRequestsTable.status, "queued"))
    .limit(SCAN_QUEUE_BATCH);

  if (queued.length === 0) return;

  console.log(`[PM] Scan queue processor: dispatching ${queued.length} queued scan(s)`);

  for (const request of queued) {
    try {
      await db
        .update(aeoScanRequestsTable)
        .set({ status: "processing" })
        .where(
          and(
            eq(aeoScanRequestsTable.id, request.id),
            eq(aeoScanRequestsTable.status, "queued")
          )
        );

      const result = await dispatchScanToPirateMonster(request.id, request.url);

      if (!result.success) {
        console.error(`[PM] Scan queue: failed to dispatch request ${request.id} (${request.url}): ${result.error}`);
        await db
          .update(aeoScanRequestsTable)
          .set({ status: "failed" })
          .where(eq(aeoScanRequestsTable.id, request.id));
      } else {
        console.log(`[PM] Scan queue: dispatched request ${request.id} (${request.url}) — pmScanId: ${result.pmScanId ?? "unknown"}`);
      }
    } catch (err: unknown) {
      console.error(`[PM] Scan queue processor error for request ${request.id}: ${errMsg(err)}`);
      try {
        await db
          .update(aeoScanRequestsTable)
          .set({ status: "failed" })
          .where(eq(aeoScanRequestsTable.id, request.id));
      } catch { }
    }
  }
}
