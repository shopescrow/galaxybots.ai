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

export async function listCrms() {
  return db.select().from(crmBlueprintsTable).orderBy(desc(crmBlueprintsTable.createdAt));
}

export async function getCrm(id: number) {
  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, id));
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

export async function deleteCrm(id: number) {
  await db.delete(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, id));
}

export class CrmValidationError extends Error {}

export function validateBlueprint(def: CrmBlueprintDef): void {
  if (!def.entities || def.entities.length === 0) {
    throw new CrmValidationError("Blueprint must define at least one entity");
  }
  for (const entity of def.entities) {
    if (!entity.name || !entity.name.trim()) {
      throw new CrmValidationError("Entity name is required");
    }
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
}

export async function updateCrm(
  id: number,
  patch: { name?: string | null; description?: string | null; definition?: CrmBlueprintDef }
) {
  const existing = await getCrm(id);
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
    .where(eq(crmBlueprintsTable.id, id))
    .returning();
  return updated;
}

export interface CommitOptions {
  sourceRows: Record<string, unknown>[];
}

export async function commitCrm(crmId: number, opts: CommitOptions) {
  const crm = await getCrm(crmId);
  if (!crm) return null;

  const def = crm.definition as CrmBlueprintDef;
  if (!def.entities || def.entities.length === 0) {
    return { crmId, recordsLoaded: 0, status: crm.status };
  }

  // For v1, all source rows project into the FIRST entity in the blueprint.
  const entity = def.entities[0]!;

  // Wrap delete + insert + status update in a single transaction with a
  // per-CRM advisory lock so concurrent commits are serialized and partial
  // failures roll back cleanly.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${42}, ${crmId})`);

    await tx
      .delete(crmRecordsTable)
      .where(and(eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.entityType, entity.name)));

    let inserted = 0;
    if (opts.sourceRows.length > 0) {
      const values = opts.sourceRows.map((row) => ({
        crmId,
        entityType: entity.name,
        data: projectRowToEntity(row, entity),
      }));

      const CHUNK = 500;
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK);
        await tx.insert(crmRecordsTable).values(chunk);
        inserted += chunk.length;
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

    return { crmId, recordsLoaded: inserted, status: "committed" as const };
  });
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
