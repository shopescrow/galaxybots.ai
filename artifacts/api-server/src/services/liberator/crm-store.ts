import { and, eq, sql, asc, desc, count } from "drizzle-orm";
import {
  db,
  crmBlueprintsTable,
  crmRecordsTable,
  type CrmBlueprintDef,
  type CrmFieldDef,
  type CrmEntityDef,
} from "@workspace/db";

export type { CrmBlueprintDef, CrmFieldDef, CrmEntityDef };

export function findEntity(def: CrmBlueprintDef, entityName: string): CrmEntityDef | undefined {
  return def.entities.find((e) => e.name === entityName);
}

export function coerceValue(field: CrmFieldDef, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (field.type) {
    case "number": {
      if (typeof raw === "number") return raw;
      const n = Number(String(raw).replace(/[,$%\s]/g, ""));
      return isNaN(n) ? null : n;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const v = String(raw).trim().toLowerCase();
      if (["true", "yes", "1"].includes(v)) return true;
      if (["false", "no", "0"].includes(v)) return false;
      return null;
    }
    case "date": {
      const d = new Date(String(raw));
      return isNaN(d.getTime()) ? String(raw) : d.toISOString();
    }
    default:
      return typeof raw === "string" ? raw : raw;
  }
}

export function projectRowToEntity(
  row: Record<string, unknown>,
  entity: CrmEntityDef
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of entity.fields) {
    const sourceKey = f.sourceField || f.name;
    out[f.name] = coerceValue(f, row[sourceKey]);
  }
  return out;
}

export async function listCrms(ownerUserId: number) {
  return db
    .select()
    .from(crmBlueprintsTable)
    .where(eq(crmBlueprintsTable.ownerUserId, ownerUserId))
    .orderBy(desc(crmBlueprintsTable.createdAt));
}

export async function getCrm(id: number, ownerUserId?: number) {
  const conditions = [eq(crmBlueprintsTable.id, id)];
  if (ownerUserId !== undefined) {
    conditions.push(eq(crmBlueprintsTable.ownerUserId, ownerUserId));
  }
  const [crm] = await db.select().from(crmBlueprintsTable).where(and(...conditions));
  return crm;
}

export async function getEntityCounts(crmId: number) {
  const rows = await db
    .select({ entity: crmRecordsTable.entityType, c: count() })
    .from(crmRecordsTable)
    .where(eq(crmRecordsTable.crmId, crmId))
    .groupBy(crmRecordsTable.entityType);
  return rows.map((r) => ({ entity: r.entity, count: Number(r.c) }));
}

export async function deleteCrm(id: number, ownerUserId: number) {
  await db
    .delete(crmBlueprintsTable)
    .where(and(eq(crmBlueprintsTable.id, id), eq(crmBlueprintsTable.ownerUserId, ownerUserId)));
}

export class CrmValidationError extends Error {}

export function validateBlueprint(def: CrmBlueprintDef): void {
  if (!def.entities || def.entities.length === 0) {
    throw new CrmValidationError("Blueprint must define at least one entity");
  }
  const entityNames = new Set<string>();
  for (const entity of def.entities) {
    if (!entity.name || !entity.name.trim()) {
      throw new CrmValidationError("Entity name is required");
    }
    if (entityNames.has(entity.name)) {
      throw new CrmValidationError(`Duplicate entity name '${entity.name}'`);
    }
    entityNames.add(entity.name);
    const seen = new Set<string>();
    for (const f of entity.fields) {
      if (!f.name || !f.name.trim()) {
        throw new CrmValidationError(`Entity '${entity.name}' has a field with no name`);
      }
      if (seen.has(f.name)) {
        throw new CrmValidationError(`Entity '${entity.name}' has duplicate field name '${f.name}'`);
      }
      seen.add(f.name);
    }
  }
  // Validate every linkTo references an existing, different entity.
  for (const entity of def.entities) {
    for (const f of entity.fields) {
      if (!f.linkTo) continue;
      if (!entityNames.has(f.linkTo)) {
        throw new CrmValidationError(
          `Field '${entity.name}.${f.name}' links to unknown entity '${f.linkTo}'`,
        );
      }
      if (f.linkTo === entity.name) {
        throw new CrmValidationError(
          `Field '${entity.name}.${f.name}' cannot link to its own entity`,
        );
      }
    }
  }
}

export async function updateCrm(
  id: number,
  ownerUserId: number,
  patch: { name?: string | null; description?: string | null; definition?: CrmBlueprintDef }
) {
  const existing = await getCrm(id, ownerUserId);
  if (!existing) return null;

  if (patch.definition) {
    if (existing.status !== "draft") {
      throw new CrmValidationError("Cannot change blueprint definition after CRM has been committed");
    }
    validateBlueprint(patch.definition);
  }

  const set: Record<string, unknown> = {};
  if (patch.name != null) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.definition) set.definition = patch.definition;
  if (Object.keys(set).length === 0) {
    return existing;
  }
  const [updated] = await db
    .update(crmBlueprintsTable)
    .set(set)
    .where(and(eq(crmBlueprintsTable.id, id), eq(crmBlueprintsTable.ownerUserId, ownerUserId)))
    .returning();
  return updated;
}

export interface CommitOptions {
  sourceRows: Record<string, unknown>[];
}

/** Returns the set of entity names that are referenced by a `linkTo` field on
 * any other entity in the blueprint. Records projected into a referenced
 * entity get deduplicated by primary display value during commit so that a
 * shared entity (e.g. Companies) doesn't get one row per source contact. */
export function linkedTargetEntityNames(def: CrmBlueprintDef): Set<string> {
  const out = new Set<string>();
  for (const e of def.entities) {
    for (const f of e.fields) {
      if (f.linkTo) out.add(f.linkTo);
    }
  }
  return out;
}

function entityPrimaryValue(row: Record<string, unknown>, entity: CrmEntityDef): string | null {
  const key = entity.primaryDisplayField;
  if (!key) return null;
  const v = row[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function commitCrm(crmId: number, opts: CommitOptions) {
  const crm = await getCrm(crmId);
  if (!crm) return null;

  const def = crm.definition as CrmBlueprintDef;
  if (!def.entities || def.entities.length === 0) {
    return { crmId, recordsLoaded: 0, status: crm.status };
  }

  const linkedTargets = linkedTargetEntityNames(def);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${42}, ${crmId})`);

    // Replace all entities for this CRM in one shot.
    for (const entity of def.entities) {
      await tx
        .delete(crmRecordsTable)
        .where(and(eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.entityType, entity.name)));
    }

    let totalInserted = 0;
    const CHUNK = 500;

    for (const entity of def.entities) {
      const projected: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      const dedupe = linkedTargets.has(entity.name);

      for (const row of opts.sourceRows) {
        const data = projectRowToEntity(row, entity);
        // Skip empty projections (no field on this entity has a value).
        const hasAny = Object.values(data).some((v) => v !== null && v !== undefined && v !== "");
        if (!hasAny) continue;

        if (dedupe) {
          const key = entityPrimaryValue(data, entity);
          if (key === null) continue;
          const k = key.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
        }

        projected.push(data);
      }

      if (projected.length === 0) continue;
      const values = projected.map((data) => ({ crmId, entityType: entity.name, data }));
      for (let i = 0; i < values.length; i += CHUNK) {
        await tx.insert(crmRecordsTable).values(values.slice(i, i + CHUNK));
        totalInserted += Math.min(CHUNK, values.length - i);
      }
    }

    const totalCount = await tx
      .select({ c: count() })
      .from(crmRecordsTable)
      .where(eq(crmRecordsTable.crmId, crmId));

    await tx
      .update(crmBlueprintsTable)
      .set({ status: "committed", recordCount: Number(totalCount[0]?.c ?? 0) })
      .where(eq(crmBlueprintsTable.id, crmId));

    return { crmId, recordsLoaded: totalInserted, status: "committed" as const };
  });
}

/** Find records in other entities that reference `record` via a `linkTo`
 * field. The link match is value-based against the target entity's primary
 * display field (no DB-level FK is used). */
export async function getRelatedRecords(
  crmId: number,
  entityName: string,
  recordId: number,
): Promise<{
  entityType: string;
  entityLabel: string;
  fieldName: string;
  fieldLabel: string;
  records: typeof crmRecordsTable.$inferSelect[];
}[]> {
  const crm = await getCrm(crmId);
  if (!crm) return [];
  const def = crm.definition as CrmBlueprintDef;
  const target = findEntity(def, entityName);
  if (!target) return [];

  const [rec] = await db
    .select()
    .from(crmRecordsTable)
    .where(and(
      eq(crmRecordsTable.crmId, crmId),
      eq(crmRecordsTable.id, recordId),
      eq(crmRecordsTable.entityType, entityName),
    ));
  if (!rec) return [];

  const primary = target.primaryDisplayField;
  if (!primary) return [];
  const data = rec.data as Record<string, unknown>;
  const value = data[primary];
  if (value === null || value === undefined || String(value).trim() === "") return [];
  const valueStr = String(value);

  const out: Awaited<ReturnType<typeof getRelatedRecords>> = [];
  for (const other of def.entities) {
    if (other.name === entityName) continue;
    for (const f of other.fields) {
      if (f.linkTo !== entityName) continue;
      const records = await db
        .select()
        .from(crmRecordsTable)
        .where(and(
          eq(crmRecordsTable.crmId, crmId),
          eq(crmRecordsTable.entityType, other.name),
          sql`LOWER(${crmRecordsTable.data} ->> ${f.name}) = LOWER(${valueStr})`,
        ))
        .orderBy(asc(crmRecordsTable.id))
        .limit(200);
      out.push({
        entityType: other.name,
        entityLabel: other.label,
        fieldName: f.name,
        fieldLabel: f.label,
        records,
      });
    }
  }
  return out;
}

/** Stream-fetch all records for an entity in pages — used by exports. */
export async function getAllRecords(crmId: number, entityType: string): Promise<Record<string, unknown>[]> {
  const PAGE = 500;
  const out: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(crmRecordsTable)
      .where(and(eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.entityType, entityType)))
      .orderBy(asc(crmRecordsTable.id))
      .limit(PAGE)
      .offset(offset);
    if (rows.length === 0) break;
    for (const r of rows) out.push(r.data as Record<string, unknown>);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

export interface ListRecordsOptions {
  search?: string | null;
  sort?: string | null;
  order?: "asc" | "desc" | null;
  limit?: number | null;
  offset?: number | null;
  needsReview?: boolean | null;
}

export async function listRecords(crmId: number, entityType: string, opts: ListRecordsOptions) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const conditions = [eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.entityType, entityType)];
  if (opts.needsReview === true) {
    conditions.push(eq(crmRecordsTable.needsReview, true));
  }
  const whereExpr = and(...conditions);

  // Sorting on JSONB field
  let orderExpr;
  if (opts.sort) {
    const dir = opts.order === "asc" ? asc : desc;
    orderExpr = dir(sql`${crmRecordsTable.data} ->> ${opts.sort}`);
  } else {
    orderExpr = desc(crmRecordsTable.createdAt);
  }

  let rowsQuery = db.select().from(crmRecordsTable).where(whereExpr);

  // Search: case-insensitive substring match across the JSONB blob
  if (opts.search && opts.search.trim() !== "") {
    const pattern = `%${opts.search.trim()}%`;
    rowsQuery = db
      .select()
      .from(crmRecordsTable)
      .where(and(whereExpr, sql`${crmRecordsTable.data}::text ILIKE ${pattern}`));
  }

  const records = await rowsQuery.orderBy(orderExpr).limit(limit).offset(offset);

  const totalQuery =
    opts.search && opts.search.trim() !== ""
      ? db
          .select({ c: count() })
          .from(crmRecordsTable)
          .where(and(whereExpr, sql`${crmRecordsTable.data}::text ILIKE ${`%${opts.search.trim()}%`}`))
      : db.select({ c: count() }).from(crmRecordsTable).where(whereExpr);

  const [{ c: total }] = await totalQuery;

  return { records, total: Number(total), limit, offset };
}

export async function getRecord(crmId: number, recordId: number) {
  const [r] = await db
    .select()
    .from(crmRecordsTable)
    .where(and(eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.id, recordId)));
  return r;
}

export async function createRecord(crmId: number, entityType: string, data: Record<string, unknown>) {
  const [r] = await db
    .insert(crmRecordsTable)
    .values({ crmId, entityType, data })
    .returning();
  await refreshCount(crmId);
  return r;
}

export async function updateRecord(crmId: number, recordId: number, data: Record<string, unknown>) {
  const [r] = await db
    .update(crmRecordsTable)
    .set({ data })
    .where(and(eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.id, recordId)))
    .returning();
  return r;
}

export async function deleteRecord(crmId: number, recordId: number) {
  await db
    .delete(crmRecordsTable)
    .where(and(eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.id, recordId)));
  await refreshCount(crmId);
}

async function refreshCount(crmId: number) {
  const [{ c }] = await db
    .select({ c: count() })
    .from(crmRecordsTable)
    .where(eq(crmRecordsTable.crmId, crmId));
  await db
    .update(crmBlueprintsTable)
    .set({ recordCount: Number(c) })
    .where(eq(crmBlueprintsTable.id, crmId));
}
