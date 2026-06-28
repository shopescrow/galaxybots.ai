/**
 * Scheduled newsletter generation (task #265, low-frequency job).
 *
 * For each client that has opted in (coordinator_client_settings flag
 * `content_newsletter_enabled = "true"`), generate a recurring newsletter issue
 * on a weekly cadence and store it as an Asset Studio asset (draft) for human
 * review before export.
 *
 * Governance parity: this unattended job resolves a real clientId per issue and
 * routes generation through the SAME callWithFallback + brand-voice path as the
 * request-driven tool. It never publishes or sends — issues land in `draft`.
 */

import {
  db,
  clientsTable,
  botsTable,
  coordinatorClientSettingsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateNewsletterAsset } from "../../content/content-assets";
import { createNotification } from "../../admin/notifications";

const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const ENABLED_KEY = "content_newsletter_enabled";
const LAST_RUN_KEY = "content_newsletter_last_run";
const INDUSTRY_KEY = "content_newsletter_industry";

let lastSweep = 0;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function checkContentNewsletters(): Promise<void> {
  const now = Date.now();
  // The low-freq scheduler ticks daily; we still self-gate to avoid double runs.
  if (now - lastSweep < 12 * 60 * 60 * 1000) return;
  lastSweep = now;

  let creatorBotId: number | null = null;
  try {
    const [bot] = await db
      .select({ id: botsTable.id })
      .from(botsTable)
      .where(eq(botsTable.name, "Content & Data Creator"))
      .limit(1);
    creatorBotId = bot?.id ?? null;
  } catch {
    creatorBotId = null;
  }

  let enabledRows: Array<{ clientId: number }> = [];
  try {
    enabledRows = await db
      .select({ clientId: coordinatorClientSettingsTable.clientId })
      .from(coordinatorClientSettingsTable)
      .where(
        and(
          eq(coordinatorClientSettingsTable.settingKey, ENABLED_KEY),
          eq(coordinatorClientSettingsTable.settingValue, "true"),
        ),
      );
  } catch (err) {
    console.error(`[scheduler] content newsletters: enabled lookup failed: ${errMsg(err)}`);
    return;
  }

  for (const { clientId } of enabledRows) {
    try {
      const settings = await db
        .select({
          key: coordinatorClientSettingsTable.settingKey,
          value: coordinatorClientSettingsTable.settingValue,
        })
        .from(coordinatorClientSettingsTable)
        .where(eq(coordinatorClientSettingsTable.clientId, clientId));
      const settingMap = new Map(settings.map((s) => [s.key, s.value]));

      const lastRun = Number(settingMap.get(LAST_RUN_KEY) ?? 0);
      if (Number.isFinite(lastRun) && now - lastRun < WEEKLY_INTERVAL_MS) continue;

      const [client] = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId))
        .limit(1);
      if (!client) continue;

      const industry = settingMap.get(INDUSTRY_KEY) || client.industry || "technology";

      const { asset, title, edition } = await generateNewsletterAsset({
        clientId,
        botId: creatorBotId,
        botName: "Content & Data Creator",
        industry,
        audience: client.targetMarket ?? undefined,
        submitForReview: false,
      });

      await db
        .insert(coordinatorClientSettingsTable)
        .values({ clientId, settingKey: LAST_RUN_KEY, settingValue: String(now) })
        .onConflictDoUpdate({
          target: [coordinatorClientSettingsTable.clientId, coordinatorClientSettingsTable.settingKey],
          set: { settingValue: String(now), updatedAt: new Date() },
        });

      await createNotification({
        clientId,
        category: "bot",
        severity: "info",
        title: "New newsletter issue ready for review",
        body: `The Content & Data Creator drafted "${title}" (${edition}). Review and approve it in Asset Studio before export.`,
        link: `/asset-studio/${asset.id}`,
        isScheduled: true,
        metadata: { assetId: asset.id, contentKind: "newsletter" },
      });
    } catch (err) {
      console.error(`[scheduler] content newsletter for client ${clientId}: ${errMsg(err)}`);
    }
  }
}
