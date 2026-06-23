import {
  db,
  toolActivityLogTable,
  syntheticControlsTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import crypto from "crypto";

const CONTROL_WINDOW_DAYS = 7;
const MIN_CONTROL_COHORT_SIZE = 3;

function hashAction(toolName: string, clientId: number, windowStart: Date): string {
  return crypto
    .createHash("sha256")
    .update(`${toolName}:${clientId}:${windowStart.toISOString().slice(0, 10)}`)
    .digest("hex")
    .slice(0, 16);
}

interface ClientProfile {
  id: number;
  industry: string | null;
  size: string | null;
}

async function getClientProfile(clientId: number): Promise<ClientProfile | null> {
  const [client] = await db
    .select({ id: clientsTable.id, industry: clientsTable.industry, size: clientsTable.size })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  return client ?? null;
}

async function findControlCohort(
  treatedClientId: number,
  toolName: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<{ controlClientIds: number[]; matchScore: number }> {
  const treatedProfile = await getClientProfile(treatedClientId);

  const allActionsInWindow = await db
    .select({ clientId: toolActivityLogTable.clientId })
    .from(toolActivityLogTable)
    .where(
      and(
        gte(toolActivityLogTable.createdAt, windowStart),
        lte(toolActivityLogTable.createdAt, windowEnd),
        eq(toolActivityLogTable.toolName, toolName),
        ne(toolActivityLogTable.clientId, treatedClientId),
      ),
    );

  const treatedClients = new Set(allActionsInWindow.map((r) => r.clientId).filter(Boolean));

  const [allClients] = await Promise.all([
    db
      .select({ id: clientsTable.id, industry: clientsTable.industry, size: clientsTable.size })
      .from(clientsTable)
      .where(ne(clientsTable.id, treatedClientId)),
  ]);

  const eligibleControls = allClients.filter((c) => !treatedClients.has(c.id));

  const scored = eligibleControls.map((c) => {
    let score = 0;
    if (treatedProfile?.industry && c.industry === treatedProfile.industry) score += 2;
    if (treatedProfile?.size && c.size === treatedProfile.size) score += 2;
    return { id: c.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 10);
  const controlClientIds = top.map((c) => c.id);
  const matchScore = top.length > 0 ? top.reduce((s, c) => s + c.score, 0) / (top.length * 4) : 0;

  return { controlClientIds, matchScore };
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let lastSyntheticControlScanRun = 0;

export async function runSyntheticControlScan(): Promise<void> {
  const now = Date.now();
  if (now - lastSyntheticControlScanRun < ONE_WEEK_MS) return;
  lastSyntheticControlScanRun = now;

  const cutoff = new Date(now - ONE_WEEK_MS);

  const recentActivity = await db
    .select({ clientId: toolActivityLogTable.clientId, toolName: toolActivityLogTable.toolName })
    .from(toolActivityLogTable)
    .where(gte(toolActivityLogTable.createdAt, cutoff));

  const uniquePairs = new Map<string, { clientId: number; toolName: string }>();
  for (const row of recentActivity) {
    if (!row.clientId) continue;
    const key = `${row.clientId}:${row.toolName}`;
    if (!uniquePairs.has(key)) uniquePairs.set(key, { clientId: row.clientId, toolName: row.toolName });
  }

  let built = 0;
  let skipped = 0;
  for (const { clientId, toolName } of uniquePairs.values()) {
    try {
      const result = await buildSyntheticControl(clientId, toolName);
      if (result !== null) built++;
      else skipped++;
    } catch (err) {
      console.error(`[synthetic-control-scan] Error for client=${clientId} tool=${toolName}:`, err);
    }
  }

  console.log(`[synthetic-control-scan] Scan complete: ${built} built, ${skipped} skipped (insufficient cohort)`);
}

export async function buildSyntheticControl(
  clientId: number,
  toolName: string,
  baselineMetrics: Record<string, number> = {},
): Promise<number | null> {
  const windowStart = new Date(Date.now() - CONTROL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowEnd = new Date();

  const actionHash = hashAction(toolName, clientId, windowStart);

  const existing = await db
    .select({ id: syntheticControlsTable.id })
    .from(syntheticControlsTable)
    .where(
      and(
        eq(syntheticControlsTable.clientId, clientId),
        eq(syntheticControlsTable.actionHash, actionHash),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const { controlClientIds, matchScore } = await findControlCohort(
    clientId,
    toolName,
    windowStart,
    windowEnd,
  );

  if (controlClientIds.length < MIN_CONTROL_COHORT_SIZE) {
    console.log(
      `[synthetic-control] Insufficient control cohort for client ${clientId} / ${toolName} (${controlClientIds.length} < ${MIN_CONTROL_COHORT_SIZE})`,
    );
    return null;
  }

  const treatedProfile = await getClientProfile(clientId);

  const [control] = await db
    .insert(syntheticControlsTable)
    .values({
      clientId,
      actionHash,
      controlClientIds,
      baselineMetrics,
      industryVertical: treatedProfile?.industry ?? null,
      sizeCategory: treatedProfile?.size ?? null,
      matchScore,
      windowStart,
      windowEnd,
    })
    .returning();

  console.log(
    `[synthetic-control] Built control cohort for client ${clientId} / ${toolName}: ${controlClientIds.length} controls, match score ${matchScore.toFixed(2)}`,
  );

  return control.id;
}
