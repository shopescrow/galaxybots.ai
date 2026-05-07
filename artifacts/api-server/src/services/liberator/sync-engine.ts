import { and, eq, sql, desc, count, asc, inArray, isNull } from "drizzle-orm";
import {
  db,
  crmBlueprintsTable,
  crmRecordsTable,
  crmSyncRunsTable,
  crmSyncChangesTable,
  extractionJobsTable,
  type CrmBlueprintDef,
  type CrmEntityDef,
  type CrmFieldDiff,
  type CrmSchemaDrift,
  type CrmSyncTotals,
  type CrmSyncConflictPolicy,
} from "@workspace/db";
import { runExtractionForJob } from "./extraction-engine";
import { inferBlueprintFromRows } from "./schema-inference";
import { coerceValue, projectRowToEntity } from "./crm-store";

const logger = {
  info: (m: string, ctx: Record<string, unknown> = {}) => console.log(`[liberator-sync] ${m}`, JSON.stringify(ctx)),
  warn: (m: string, ctx: Record<string, unknown> = {}) => console.warn(`[liberator-sync] ${m}`, JSON.stringify(ctx)),
  error: (m: string, ctx: Record<string, unknown> = {}) => console.error(`[liberator-sync] ${m}`, JSON.stringify(ctx)),
};

const CADENCE_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function pickIdentityFields(entity: CrmEntityDef, override: string[] | null | undefined): string[] {
  if (override && override.length > 0) return override;
  if (entity.primaryDisplayField) return [entity.primaryDisplayField];
  const email = entity.fields.find((f) => f.type === "email")?.name;
  if (email) return [email];
  const url = entity.fields.find((f) => f.type === "url")?.name;
  if (url) return [url];
  const str = entity.fields.find((f) => f.type === "string" || f.type === "text")?.name;
  if (str) return [str];
  return entity.fields.slice(0, 1).map((f) => f.name);
}

export function computeIdentityKey(
  data: Record<string, unknown>,
  identityFields: string[],
): string {
  const parts = identityFields.map((f) => {
    const v = data[f];
    if (v === null || v === undefined) return "";
    return String(v).trim().toLowerCase();
  });
  return parts.join("|");
}

export function detectSchemaDrift(current: CrmBlueprintDef, freshDef: CrmBlueprintDef): CrmSchemaDrift | null {
  const currentEntity = current.entities[0];
  const freshEntity = freshDef.entities[0];
  if (!currentEntity || !freshEntity) return null;
  const currentMap = new Map(currentEntity.fields.map((f) => [f.name, f]));
  const freshMap = new Map(freshEntity.fields.map((f) => [f.name, f]));

  const added: { name: string; type: string }[] = [];
  const removed: { name: string; type: string }[] = [];
  const changed: { name: string; oldType: string; newType: string }[] = [];

  for (const [name, f] of freshMap) {
    if (!currentMap.has(name)) added.push({ name, type: f.type });
  }
  for (const [name, f] of currentMap) {
    if (!freshMap.has(name)) removed.push({ name, type: f.type });
  }
  for (const [name, freshF] of freshMap) {
    const curF = currentMap.get(name);
    if (curF && curF.type !== freshF.type) {
      changed.push({ name, oldType: curF.type, newType: freshF.type });
    }
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) return null;
  return { added, removed, changed };
}

function isSignificantDrift(d: CrmSchemaDrift): boolean {
  return d.removed.length > 0 || d.changed.length > 0 || d.added.length > 0;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

interface ReconcileContext {
  crmId: number;
  entity: CrmEntityDef;
  identityFields: string[];
  conflictPolicy: CrmSyncConflictPolicy;
  freshRows: Record<string, unknown>[];
}

interface ReconcileResult {
  changes: Array<{
    changeType: "new" | "changed" | "unchanged" | "removed";
    identityKey: string;
    recordId: number | null;
    oldData: Record<string, unknown> | null;
    newData: Record<string, unknown> | null;
    fieldDiffs: CrmFieldDiff[];
    hasConflicts: boolean;
    autoApply: boolean;
  }>;
  totals: CrmSyncTotals;
}

async function reconcile(ctx: ReconcileContext): Promise<ReconcileResult> {
  const { crmId, entity, identityFields, conflictPolicy, freshRows } = ctx;

  const existing = await db
    .select()
    .from(crmRecordsTable)
    .where(and(eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.entityType, entity.name)));

  const existingByKey = new Map<string, typeof existing[number]>();
  for (const rec of existing) {
    const data = rec.data as Record<string, unknown>;
    const key = rec.identityKey || computeIdentityKey(data, identityFields);
    if (!existingByKey.has(key)) existingByKey.set(key, rec);
  }

  const seenKeys = new Set<string>();
  const result: ReconcileResult = {
    changes: [],
    totals: { new: 0, changed: 0, unchanged: 0, removed: 0, conflicts: 0 },
  };

  for (const rawRow of freshRows) {
    const projected = projectRowToEntity(rawRow, entity);
    const key = computeIdentityKey(projected, identityFields);
    if (!key) continue;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const ex = existingByKey.get(key);
    if (!ex) {
      result.changes.push({
        changeType: "new",
        identityKey: key,
        recordId: null,
        oldData: null,
        newData: projected,
        fieldDiffs: [],
        hasConflicts: false,
        autoApply: conflictPolicy !== "ask",
      });
      result.totals.new++;
      continue;
    }

    const localData = ex.data as Record<string, unknown>;
    const lastSource = (ex.sourceData as Record<string, unknown> | null) ?? null;

    const fieldDiffs: CrmFieldDiff[] = [];
    let anyChange = false;
    let anyConflict = false;

    for (const f of entity.fields) {
      const newVal = projected[f.name] ?? null;
      const oldSourceVal = lastSource ? (lastSource[f.name] ?? null) : null;
      const localVal = localData[f.name] ?? null;

      const sourceChanged = !valuesEqual(oldSourceVal, newVal);
      const localChanged = lastSource ? !valuesEqual(oldSourceVal, localVal) : !valuesEqual(localVal, newVal);

      if (!sourceChanged) continue;
      anyChange = true;
      const conflict = lastSource ? sourceChanged && localChanged && !valuesEqual(localVal, newVal) : false;
      if (conflict) anyConflict = true;

      fieldDiffs.push({
        field: f.name,
        oldValue: localVal,
        newValue: newVal,
        conflictWithLocal: conflict,
        localValue: conflict ? localVal : undefined,
      });
    }

    if (!anyChange) {
      result.totals.unchanged++;
      result.changes.push({
        changeType: "unchanged",
        identityKey: key,
        recordId: ex.id,
        oldData: localData,
        newData: projected,
        fieldDiffs: [],
        hasConflicts: false,
        autoApply: false,
      });
      continue;
    }

    if (anyConflict) result.totals.conflicts++;
    result.totals.changed++;

    let autoApply = false;
    if (!anyConflict) {
      autoApply = conflictPolicy !== "ask";
    } else if (conflictPolicy === "source_wins") {
      autoApply = true;
    } else if (conflictPolicy === "local_wins") {
      // Don't auto-apply conflicting fields under local_wins; leave for review.
      autoApply = false;
    }

    result.changes.push({
      changeType: "changed",
      identityKey: key,
      recordId: ex.id,
      oldData: localData,
      newData: projected,
      fieldDiffs,
      hasConflicts: anyConflict,
      autoApply,
    });
  }

  // Removed: anything in existing not in fresh
  for (const [key, rec] of existingByKey) {
    if (seenKeys.has(key)) continue;
    result.totals.removed++;
    result.changes.push({
      changeType: "removed",
      identityKey: key,
      recordId: rec.id,
      oldData: rec.data as Record<string, unknown>,
      newData: null,
      fieldDiffs: [],
      hasConflicts: false,
      // Removals are sensitive — never auto-apply; require explicit user approval.
      autoApply: false,
    });
  }

  return result;
}

export interface RunSyncOptions {
  triggeredBy?: "manual" | "scheduler";
  conflictPolicyOverride?: CrmSyncConflictPolicy;
}

export async function runSyncForCrm(crmId: number, opts: RunSyncOptions = {}): Promise<number | null> {
  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, crmId));
  if (!crm) return null;
  if (crm.status !== "committed") {
    throw new Error("CRM must be committed before sync");
  }
  if (!crm.sourceJobId) {
    throw new Error("CRM has no source extraction job to sync from");
  }
  const policy = (opts.conflictPolicyOverride ?? crm.syncConflictPolicy) as CrmSyncConflictPolicy;

  const [run] = await db
    .insert(crmSyncRunsTable)
    .values({
      crmId,
      status: "running",
      triggeredBy: opts.triggeredBy ?? "manual",
      conflictPolicy: policy,
    })
    .returning();

  try {
    // Re-run extraction on the source job.
    await runExtractionForJob(crm.sourceJobId);

    const [refreshedJob] = await db
      .select()
      .from(extractionJobsTable)
      .where(eq(extractionJobsTable.id, crm.sourceJobId));

    if (!refreshedJob || refreshedJob.status !== "completed") {
      throw new Error(`Re-extraction did not complete (status=${refreshedJob?.status ?? "missing"})`);
    }

    const freshRows = (refreshedJob.extractedData as Record<string, unknown>[]) ?? [];

    const def = crm.definition as CrmBlueprintDef;
    const entity = def.entities[0];
    if (!entity) throw new Error("CRM has no entity definition");

    // Drift detection
    const freshDef = inferBlueprintFromRows(freshRows, refreshedJob.name, refreshedJob.extractionType);
    const drift = detectSchemaDrift(def, freshDef);
    if (drift && isSignificantDrift(drift)) {
      await db
        .update(crmSyncRunsTable)
        .set({
          status: "drift_paused",
          schemaDrift: drift,
          completedAt: new Date(),
        })
        .where(eq(crmSyncRunsTable.id, run.id));
      await db
        .update(crmBlueprintsTable)
        .set({ lastSyncStatus: "drift_paused", lastSyncAt: new Date() })
        .where(eq(crmBlueprintsTable.id, crmId));
      logger.warn("Sync paused for schema drift", { crmId, runId: run.id, drift });
      return run.id;
    }

    const identityFields = pickIdentityFields(entity, crm.syncIdentityFields as string[]);

    const reconciled = await reconcile({
      crmId,
      entity,
      identityFields,
      conflictPolicy: policy,
      freshRows,
    });

    // Persist changes (chunked to keep payloads bounded)
    if (reconciled.changes.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < reconciled.changes.length; i += CHUNK) {
        const chunk = reconciled.changes.slice(i, i + CHUNK).map((c) => ({
          syncRunId: run.id,
          crmId,
          entityType: entity.name,
          changeType: c.changeType,
          identityKey: c.identityKey,
          recordId: c.recordId,
          oldData: c.oldData,
          newData: c.newData,
          fieldDiffs: c.fieldDiffs,
          hasConflicts: c.hasConflicts,
          decision: c.autoApply ? ("auto_applied" as const) : ("pending" as const),
        }));
        await db.insert(crmSyncChangesTable).values(chunk);
      }
    }

    // Apply auto-approved changes
    let autoApplied = 0;
    for (const c of reconciled.changes) {
      if (!c.autoApply) continue;
      try {
        await applyChange(crmId, entity, identityFields, c.changeType, c.recordId, c.identityKey, c.newData, c.oldData);
        autoApplied++;
      } catch (err) {
        logger.error("Auto-apply change failed", { crmId, runId: run.id, err: err instanceof Error ? err.message : String(err) });
      }
    }

    await db
      .update(crmSyncRunsTable)
      .set({
        status: "completed",
        totals: reconciled.totals,
        completedAt: new Date(),
      })
      .where(eq(crmSyncRunsTable.id, run.id));

    // Mark applied rows
    if (autoApplied > 0) {
      await db
        .update(crmSyncChangesTable)
        .set({ appliedAt: new Date() })
        .where(and(eq(crmSyncChangesTable.syncRunId, run.id), eq(crmSyncChangesTable.decision, "auto_applied")));
    }

    await refreshRecordCount(crmId);
    await db
      .update(crmBlueprintsTable)
      .set({ lastSyncStatus: "completed", lastSyncAt: new Date() })
      .where(eq(crmBlueprintsTable.id, crmId));

    logger.info("Sync completed", { crmId, runId: run.id, totals: reconciled.totals, autoApplied });
    return run.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Sync failed", { crmId, runId: run.id, err: msg });
    await db
      .update(crmSyncRunsTable)
      .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
      .where(eq(crmSyncRunsTable.id, run.id));
    await db
      .update(crmBlueprintsTable)
      .set({ lastSyncStatus: "failed", lastSyncAt: new Date() })
      .where(eq(crmBlueprintsTable.id, crmId));
    return run.id;
  }
}

async function applyChange(
  crmId: number,
  entity: CrmEntityDef,
  identityFields: string[],
  changeType: "new" | "changed" | "unchanged" | "removed",
  recordId: number | null,
  identityKey: string,
  newData: Record<string, unknown> | null,
  oldData: Record<string, unknown> | null,
): Promise<void> {
  const now = new Date();
  if (changeType === "new" && newData) {
    await db.insert(crmRecordsTable).values({
      crmId,
      entityType: entity.name,
      data: newData,
      identityKey,
      sourceData: newData,
      lastSyncedAt: now,
    });
  } else if (changeType === "changed" && recordId && newData) {
    // Merge: write newData (which is full projection from source)
    await db
      .update(crmRecordsTable)
      .set({
        data: newData,
        identityKey,
        sourceData: newData,
        lastSyncedAt: now,
      })
      .where(eq(crmRecordsTable.id, recordId));
  } else if (changeType === "removed" && recordId) {
    await db.delete(crmRecordsTable).where(eq(crmRecordsTable.id, recordId));
  }
}

export async function decideChange(
  changeId: number,
  decision: "approved" | "rejected",
): Promise<void> {
  const [ch] = await db.select().from(crmSyncChangesTable).where(eq(crmSyncChangesTable.id, changeId));
  if (!ch) throw new Error("Change not found");
  if (ch.decision !== "pending") throw new Error(`Change already ${ch.decision}`);

  if (decision === "rejected") {
    await db
      .update(crmSyncChangesTable)
      .set({ decision: "rejected", decidedAt: new Date() })
      .where(eq(crmSyncChangesTable.id, changeId));
    return;
  }

  // Apply
  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, ch.crmId));
  if (!crm) throw new Error("CRM not found");
  const entity = (crm.definition as CrmBlueprintDef).entities[0];
  if (!entity) throw new Error("CRM has no entity");

  await applyChange(
    ch.crmId,
    entity,
    pickIdentityFields(entity, crm.syncIdentityFields as string[]),
    ch.changeType as "new" | "changed" | "unchanged" | "removed",
    ch.recordId,
    ch.identityKey ?? "",
    ch.newData as Record<string, unknown> | null,
    ch.oldData as Record<string, unknown> | null,
  );
  await db
    .update(crmSyncChangesTable)
    .set({ decision: "approved", decidedAt: new Date(), appliedAt: new Date() })
    .where(eq(crmSyncChangesTable.id, changeId));
  await refreshRecordCount(ch.crmId);
}

export async function applyAllPending(syncRunId: number): Promise<{ applied: number }> {
  const pending = await db
    .select()
    .from(crmSyncChangesTable)
    .where(and(eq(crmSyncChangesTable.syncRunId, syncRunId), eq(crmSyncChangesTable.decision, "pending")));
  let applied = 0;
  for (const ch of pending) {
    if (ch.changeType === "unchanged") {
      await db
        .update(crmSyncChangesTable)
        .set({ decision: "approved", decidedAt: new Date() })
        .where(eq(crmSyncChangesTable.id, ch.id));
      continue;
    }
    try {
      await decideChange(ch.id, "approved");
      applied++;
    } catch (err) {
      logger.error("applyAllPending failed for change", { changeId: ch.id, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return { applied };
}

export async function rejectAllPending(syncRunId: number): Promise<{ rejected: number }> {
  const result = await db
    .update(crmSyncChangesTable)
    .set({ decision: "rejected", decidedAt: new Date() })
    .where(and(eq(crmSyncChangesTable.syncRunId, syncRunId), eq(crmSyncChangesTable.decision, "pending")))
    .returning({ id: crmSyncChangesTable.id });
  return { rejected: result.length };
}

export async function rollbackSyncRun(syncRunId: number): Promise<{ reversed: number }> {
  const [run] = await db.select().from(crmSyncRunsTable).where(eq(crmSyncRunsTable.id, syncRunId));
  if (!run) throw new Error("Sync run not found");
  if (run.status === "rolled_back") throw new Error("Sync run already rolled back");

  const applied = await db
    .select()
    .from(crmSyncChangesTable)
    .where(
      and(
        eq(crmSyncChangesTable.syncRunId, syncRunId),
        inArray(crmSyncChangesTable.decision, ["auto_applied", "approved"]),
      ),
    );

  let reversed = 0;
  for (const ch of applied) {
    try {
      if (ch.changeType === "new" && ch.identityKey) {
        // Delete the record we created
        await db
          .delete(crmRecordsTable)
          .where(
            and(
              eq(crmRecordsTable.crmId, ch.crmId),
              eq(crmRecordsTable.entityType, ch.entityType),
              eq(crmRecordsTable.identityKey, ch.identityKey),
            ),
          );
        reversed++;
      } else if (ch.changeType === "changed" && ch.recordId && ch.oldData) {
        await db
          .update(crmRecordsTable)
          .set({ data: ch.oldData as Record<string, unknown> })
          .where(eq(crmRecordsTable.id, ch.recordId));
        reversed++;
      } else if (ch.changeType === "removed" && ch.oldData && ch.identityKey) {
        await db.insert(crmRecordsTable).values({
          crmId: ch.crmId,
          entityType: ch.entityType,
          data: ch.oldData as Record<string, unknown>,
          identityKey: ch.identityKey,
        });
        reversed++;
      }
    } catch (err) {
      logger.error("Rollback step failed", { changeId: ch.id, err: err instanceof Error ? err.message : String(err) });
    }
  }

  await db
    .update(crmSyncRunsTable)
    .set({ status: "rolled_back" })
    .where(eq(crmSyncRunsTable.id, syncRunId));
  await refreshRecordCount(run.crmId);
  return { reversed };
}

export async function reblueprintFromDrift(crmId: number, syncRunId: number): Promise<void> {
  const [run] = await db.select().from(crmSyncRunsTable).where(eq(crmSyncRunsTable.id, syncRunId));
  if (!run) throw new Error("Sync run not found");
  if (run.status !== "drift_paused") throw new Error("Sync run is not in drift_paused state");
  if (run.crmId !== crmId) throw new Error("Sync run belongs to a different CRM");

  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, crmId));
  if (!crm || !crm.sourceJobId) throw new Error("CRM not found or has no source");

  const [job] = await db.select().from(extractionJobsTable).where(eq(extractionJobsTable.id, crm.sourceJobId));
  if (!job) throw new Error("Source job not found");

  const freshRows = (job.extractedData as Record<string, unknown>[]) ?? [];
  const freshDef = inferBlueprintFromRows(freshRows, job.name, job.extractionType);
  const currentDef = crm.definition as CrmBlueprintDef;

  // Merge: keep current entity name + label, but adopt fresh field set, preserving labels for fields that still exist.
  const currentEntity = currentDef.entities[0];
  const freshEntity = freshDef.entities[0];
  if (!currentEntity || !freshEntity) throw new Error("Cannot re-blueprint: missing entity");
  const currentByName = new Map(currentEntity.fields.map((f) => [f.name, f]));
  const mergedEntity: CrmEntityDef = {
    ...currentEntity,
    fields: freshEntity.fields.map((f) => {
      const old = currentByName.get(f.name);
      return old ? { ...f, label: old.label, required: old.required } : f;
    }),
  };
  if (mergedEntity.primaryDisplayField && !mergedEntity.fields.find((f) => f.name === mergedEntity.primaryDisplayField)) {
    mergedEntity.primaryDisplayField = freshEntity.primaryDisplayField;
  }

  await db
    .update(crmBlueprintsTable)
    .set({ definition: { entities: [mergedEntity] } })
    .where(eq(crmBlueprintsTable.id, crmId));

  await db
    .update(crmSyncRunsTable)
    .set({ status: "rolled_back" })
    .where(eq(crmSyncRunsTable.id, syncRunId));

  logger.info("Re-blueprinted CRM after schema drift", { crmId, runId: syncRunId });
}

async function refreshRecordCount(crmId: number) {
  const [{ c }] = await db.select({ c: count() }).from(crmRecordsTable).where(eq(crmRecordsTable.crmId, crmId));
  await db.update(crmBlueprintsTable).set({ recordCount: Number(c) }).where(eq(crmBlueprintsTable.id, crmId));
}

export interface ListSyncRunsOptions {
  limit?: number;
  offset?: number;
}

export async function listSyncRuns(crmId: number, opts: ListSyncRunsOptions = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const rows = await db
    .select()
    .from(crmSyncRunsTable)
    .where(eq(crmSyncRunsTable.crmId, crmId))
    .orderBy(desc(crmSyncRunsTable.startedAt))
    .limit(limit)
    .offset(offset);
  const [{ c: total }] = await db
    .select({ c: count() })
    .from(crmSyncRunsTable)
    .where(eq(crmSyncRunsTable.crmId, crmId));
  return { runs: rows, total: Number(total), limit, offset };
}

export async function getSyncRun(crmId: number, runId: number) {
  const [run] = await db
    .select()
    .from(crmSyncRunsTable)
    .where(and(eq(crmSyncRunsTable.id, runId), eq(crmSyncRunsTable.crmId, crmId)));
  return run;
}

export interface ListSyncChangesOptions {
  changeType?: "new" | "changed" | "unchanged" | "removed" | null;
  decision?: "pending" | "approved" | "rejected" | "auto_applied" | null;
  limit?: number;
  offset?: number;
}

export async function listSyncChanges(syncRunId: number, opts: ListSyncChangesOptions = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const filters = [eq(crmSyncChangesTable.syncRunId, syncRunId)];
  if (opts.changeType) filters.push(eq(crmSyncChangesTable.changeType, opts.changeType));
  if (opts.decision) filters.push(eq(crmSyncChangesTable.decision, opts.decision));
  const whereExpr = and(...filters);
  const rows = await db
    .select()
    .from(crmSyncChangesTable)
    .where(whereExpr)
    .orderBy(asc(crmSyncChangesTable.id))
    .limit(limit)
    .offset(offset);
  const [{ c: total }] = await db.select({ c: count() }).from(crmSyncChangesTable).where(whereExpr);
  return { changes: rows, total: Number(total), limit, offset };
}

export async function updateSyncConfig(
  crmId: number,
  patch: {
    enabled?: boolean;
    cadence?: "manual" | "hourly" | "daily" | "weekly";
    conflictPolicy?: CrmSyncConflictPolicy;
    identityFields?: string[];
  },
) {
  const set: Record<string, unknown> = {};
  if (patch.enabled !== undefined) set.syncEnabled = patch.enabled;
  if (patch.cadence) set.syncCadence = patch.cadence;
  if (patch.conflictPolicy) set.syncConflictPolicy = patch.conflictPolicy;
  if (patch.identityFields) set.syncIdentityFields = patch.identityFields;
  if (Object.keys(set).length === 0) {
    const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, crmId));
    return crm;
  }
  const [updated] = await db
    .update(crmBlueprintsTable)
    .set(set)
    .where(eq(crmBlueprintsTable.id, crmId))
    .returning();
  return updated;
}

/**
 * Scheduler tick — find CRMs whose sync is due and enqueue them.
 * Returns the number of syncs kicked off.
 */
export async function checkLiberatorSyncs(): Promise<number> {
  const now = Date.now();
  const candidates = await db
    .select()
    .from(crmBlueprintsTable)
    .where(and(eq(crmBlueprintsTable.syncEnabled, true), eq(crmBlueprintsTable.status, "committed")));

  let kicked = 0;
  for (const c of candidates) {
    if (c.syncCadence === "manual") continue;
    if (!c.sourceJobId) continue;
    const interval = CADENCE_MS[c.syncCadence];
    if (!interval) continue;
    const last = c.lastSyncAt ? c.lastSyncAt.getTime() : 0;
    if (now - last < interval) continue;

    // Skip if a run is currently in progress for this CRM
    const [inProgress] = await db
      .select({ id: crmSyncRunsTable.id })
      .from(crmSyncRunsTable)
      .where(and(eq(crmSyncRunsTable.crmId, c.id), inArray(crmSyncRunsTable.status, ["pending", "running"])))
      .limit(1);
    if (inProgress) continue;

    // Optimistic lastSyncAt bump so a slow tick doesn't double-fire
    await db
      .update(crmBlueprintsTable)
      .set({ lastSyncAt: new Date(), lastSyncStatus: "running" })
      .where(eq(crmBlueprintsTable.id, c.id));

    runSyncForCrm(c.id, { triggeredBy: "scheduler" }).catch((err) => {
      logger.error("Scheduled sync failed", { crmId: c.id, err: err instanceof Error ? err.message : String(err) });
    });
    kicked++;
  }
  return kicked;
}

// Suppress unused-import lint for sql/isNull which we keep for future use.
void sql;
void isNull;
