import {
  getActiveCategories,
  refreshOpportunityScores,
} from "../../intelligence/demand-engine";

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
let lastRun = 0;

/**
 * Refresh cycle for the demand intelligence engine. Re-scores live niche
 * opportunities so the creation queue reflects current/seasonal trends, decays
 * aging unacted demand, and expires stale opportunities. Runs daily.
 *
 * Unlike a per-request flow, this resolves the client set from the
 * opportunities table itself (trusted, not request-supplied) and re-scores each
 * client independently.
 */
export async function runDemandRefresh(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < REFRESH_INTERVAL_MS) return;
  lastRun = now;

  const active = await getActiveCategories();
  const clientIds = [...new Set(active.map((a) => a.clientId))];
  if (clientIds.length === 0) return;

  let rescored = 0;
  let expired = 0;

  for (const clientId of clientIds) {
    try {
      const result = await refreshOpportunityScores(clientId);
      rescored += result.rescored;
      expired += result.expired;
    } catch (err) {
      console.error(`[demand-refresh] Failed for client ${clientId}:`, err);
    }
  }

  console.log(
    `[demand-refresh] Refreshed ${clientIds.length} client(s): ${rescored} re-scored, ${expired} expired.`,
  );
}
