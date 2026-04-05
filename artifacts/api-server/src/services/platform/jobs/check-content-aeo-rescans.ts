import {
  db,
  bingolingoContentTable,
  platformApiKeysTable,
  aeoScanRequestsTable,
} from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let lastContentRescanCheck = 0;
const CONTENT_RESCAN_INTERVAL = 24 * 60 * 60 * 1000;

export async function checkContentAeoRescans() {
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
