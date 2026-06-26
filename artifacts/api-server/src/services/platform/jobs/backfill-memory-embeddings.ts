import { db, clientBotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { backfillMissingEmbeddings } from "../../bots/memory";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Scheduled job: populate embeddings for memories that were stored without one
 * (e.g. written while the embedding provider was temporarily unavailable, or
 * created before the ANN retrieval path existed). Without this, null-embedding
 * memories never participate in vector retrieval and only surface via the
 * recency fallback. Running it periodically guarantees eventual indexability.
 */
export async function checkMemoryEmbeddingBackfill(): Promise<void> {
  try {
    const assignments = await db
      .select({ botId: clientBotsTable.botId, clientId: clientBotsTable.clientId })
      .from(clientBotsTable)
      .where(eq(clientBotsTable.status, "active"));

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const assignment of assignments) {
      try {
        const { processed, failed } = await backfillMissingEmbeddings({
          botId: assignment.botId,
          clientId: assignment.clientId,
          batchSize: 50,
        });
        totalProcessed += processed;
        totalFailed += failed;
      } catch (err) {
        console.error(
          `[backfill-memory-embeddings] bot ${assignment.botId}/client ${assignment.clientId} error:`,
          errMsg(err),
        );
      }
    }

    if (totalProcessed > 0 || totalFailed > 0) {
      console.log(
        `[backfill-memory-embeddings] processed ${totalProcessed}, failed ${totalFailed}`,
      );
    }
  } catch (err) {
    console.error("[backfill-memory-embeddings] top-level error:", errMsg(err));
  }
}
