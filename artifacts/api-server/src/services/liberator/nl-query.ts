import { and, eq, sql } from "drizzle-orm";
import { db, crmRecordsTable, crmBlueprintsTable, type CrmBlueprintDef, type CrmEntityDef, type CrmFieldDef } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

/* -------------------------------------------------------------------- */
/* DSL types — strict allow-list. The validator rejects anything else.   */
/* -------------------------------------------------------------------- */

export type FilterOp =
  | "eq" | "neq"
  | "gt" | "gte" | "lt" | "lte"
  | "contains" | "starts_with" | "ends_with"
  | "in" | "not_in"
  | "is_null" | "is_not_null"
  | "before" | "after";

export const FILTER_OPS: FilterOp[] = [
  "eq", "neq", "gt", "gte", "lt", "lte",
  "contains", "starts_with", "ends_with",
  "in", "not_in", "is_null", "is_not_null",
  "before", "after",
];

export interface DSLFilter {
  field: string;
  op: FilterOp;
  value?: unknown;
}

export interface QueryDSL {
  kind: "query";
  entity: string;
  filters: DSLFilter[];
  sort?: { field: string; order: "asc" | "desc" } | null;
  limit?: number | null;
  aggregate?: { op: "count" | "sum" | "avg" | "min" | "max"; field?: string | null; groupBy?: string | null } | null;
  project?: string[] | null;
  output: "table" | "chart" | "summary";
}

export type MutationOp =
  | { op: "tag"; value: string }
  | { op: "untag"; value: string }
  | { op: "delete" }
  | { op: "set_field"; field: string; value: unknown };

export interface MutationDSL {
  kind: "mutation";
  entity: string;
  filters: DSLFilter[];
  action: MutationOp;
}

export type DSL = QueryDSL | MutationDSL;

export class DSLValidationError extends Error {}

/* -------------------------------------------------------------------- */
/* Validator                                                             */
/* -------------------------------------------------------------------- */

function findEntity(def: CrmBlueprintDef, entityName: string): CrmEntityDef | undefined {
  return def.entities.find((e) => e.name === entityName);
}

function findField(entity: CrmEntityDef, fieldName: string): CrmFieldDef | undefined {
  return entity.fields.find((f) => f.name === fieldName);
}

function coerceValue(field: CrmFieldDef | undefined, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (!field) return raw;
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
      return String(raw);
  }
}

export function validateDSL(raw: unknown, def: CrmBlueprintDef): DSL {
  if (!raw || typeof raw !== "object") throw new DSLValidationError("DSL must be an object");
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== "query" && kind !== "mutation") {
    throw new DSLValidationError(`Unknown kind: ${String(kind)}`);
  }
  const entityName = String(o.entity ?? "");
  const entity = findEntity(def, entityName);
  if (!entity) throw new DSLValidationError(`Unknown entity: ${entityName}`);

  const filtersRaw = Array.isArray(o.filters) ? o.filters : [];
  const filters: DSLFilter[] = [];
  for (const f of filtersRaw) {
    if (!f || typeof f !== "object") continue;
    const ff = f as Record<string, unknown>;
    const field = String(ff.field ?? "");
    const op = String(ff.op ?? "") as FilterOp;
    if (!FILTER_OPS.includes(op)) {
      throw new DSLValidationError(`Invalid filter op: ${op}`);
    }
    // Allow `__tags` as a virtual field for tag filters.
    let fieldDef: CrmFieldDef | undefined;
    if (field === "__tags") {
      fieldDef = undefined;
    } else {
      fieldDef = findField(entity, field);
      if (!fieldDef) throw new DSLValidationError(`Unknown field on ${entityName}: ${field}`);
    }
    let value = ff.value;
    if (op === "in" || op === "not_in") {
      if (!Array.isArray(value)) throw new DSLValidationError(`Op ${op} requires an array value`);
      value = value.map((v) => coerceValue(fieldDef, v));
    } else if (op !== "is_null" && op !== "is_not_null") {
      value = coerceValue(fieldDef, value);
    }
    filters.push({ field, op, value });
  }

  if (kind === "query") {
    const output = (o.output === "chart" || o.output === "summary" || o.output === "table") ? o.output : "table";
    let sort: QueryDSL["sort"] = null;
    if (o.sort && typeof o.sort === "object") {
      const so = o.sort as Record<string, unknown>;
      const sField = String(so.field ?? "");
      if (findField(entity, sField)) {
        const order = so.order === "asc" ? "asc" : "desc";
        sort = { field: sField, order };
      }
    }
    let limit: number | null = null;
    if (typeof o.limit === "number" && o.limit > 0) limit = Math.min(Math.floor(o.limit), 1000);

    let aggregate: QueryDSL["aggregate"] = null;
    if (o.aggregate && typeof o.aggregate === "object") {
      const a = o.aggregate as Record<string, unknown>;
      const aOp = a.op as string;
      if (["count", "sum", "avg", "min", "max"].includes(aOp)) {
        const aField = a.field ? String(a.field) : null;
        const aGroup = a.groupBy ? String(a.groupBy) : null;
        if (aField && !findField(entity, aField)) throw new DSLValidationError(`aggregate.field unknown: ${aField}`);
        if (aGroup && !findField(entity, aGroup)) throw new DSLValidationError(`aggregate.groupBy unknown: ${aGroup}`);
        aggregate = { op: aOp as "count" | "sum" | "avg" | "min" | "max", field: aField, groupBy: aGroup };
      }
    }

    let project: string[] | null = null;
    if (Array.isArray(o.project)) {
      project = o.project.map(String).filter((p) => !!findField(entity, p));
    }

    return { kind: "query", entity: entityName, filters, sort, limit, aggregate, project, output } as QueryDSL;
  }

  // mutation
  const aRaw = o.action;
  if (!aRaw || typeof aRaw !== "object") throw new DSLValidationError("mutation requires an action");
  const a = aRaw as Record<string, unknown>;
  const aOp = String(a.op ?? "");
  let action: MutationOp;
  if (aOp === "tag" || aOp === "untag") {
    const value = String(a.value ?? "").trim();
    if (!value) throw new DSLValidationError(`${aOp} requires a non-empty value`);
    action = { op: aOp, value };
  } else if (aOp === "delete") {
    action = { op: "delete" };
  } else if (aOp === "set_field") {
    const fName = String(a.field ?? "");
    const fDef = findField(entity, fName);
    if (!fDef) throw new DSLValidationError(`set_field unknown field: ${fName}`);
    action = { op: "set_field", field: fName, value: coerceValue(fDef, a.value) };
  } else {
    throw new DSLValidationError(`Unknown mutation op: ${aOp}`);
  }
  return { kind: "mutation", entity: entityName, filters, action };
}

/* -------------------------------------------------------------------- */
/* Filter → SQL (parameterized via drizzle sql template)                  */
/* -------------------------------------------------------------------- */

function filterToSql(f: DSLFilter) {
  const fieldExpr = f.field === "__tags"
    ? sql`(${crmRecordsTable.data} -> '__tags')`
    : sql`(${crmRecordsTable.data} ->> ${f.field})`;
  const numericExpr = sql`((${crmRecordsTable.data} ->> ${f.field})::numeric)`;
  switch (f.op) {
    case "eq": return sql`${fieldExpr} = ${String(f.value ?? "")}`;
    case "neq": return sql`${fieldExpr} <> ${String(f.value ?? "")}`;
    case "gt": return sql`${numericExpr} > ${Number(f.value ?? 0)}`;
    case "gte": return sql`${numericExpr} >= ${Number(f.value ?? 0)}`;
    case "lt": return sql`${numericExpr} < ${Number(f.value ?? 0)}`;
    case "lte": return sql`${numericExpr} <= ${Number(f.value ?? 0)}`;
    case "contains": return sql`${fieldExpr} ILIKE ${"%" + String(f.value ?? "") + "%"}`;
    case "starts_with": return sql`${fieldExpr} ILIKE ${String(f.value ?? "") + "%"}`;
    case "ends_with": return sql`${fieldExpr} ILIKE ${"%" + String(f.value ?? "")}`;
    case "in": {
      const arr = Array.isArray(f.value) ? f.value.map((v) => String(v)) : [];
      if (arr.length === 0) return sql`false`;
      return sql`${fieldExpr} = ANY(${arr})`;
    }
    case "not_in": {
      const arr = Array.isArray(f.value) ? f.value.map((v) => String(v)) : [];
      if (arr.length === 0) return sql`true`;
      return sql`NOT (${fieldExpr} = ANY(${arr}))`;
    }
    case "is_null": return sql`${fieldExpr} IS NULL`;
    case "is_not_null": return sql`${fieldExpr} IS NOT NULL`;
    case "before": return sql`(${fieldExpr})::timestamp < ${String(f.value ?? "")}::timestamp`;
    case "after": return sql`(${fieldExpr})::timestamp > ${String(f.value ?? "")}::timestamp`;
  }
}

function buildWhere(crmId: number, dsl: DSL) {
  const conds = [eq(crmRecordsTable.crmId, crmId), eq(crmRecordsTable.entityType, dsl.entity)];
  for (const f of dsl.filters) conds.push(filterToSql(f));
  return and(...conds);
}

/* -------------------------------------------------------------------- */
/* Executors                                                             */
/* -------------------------------------------------------------------- */

export interface QueryResultPayload {
  output: "table" | "chart" | "summary";
  columns?: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  aggregate?: { op: string; value: number; groupBy?: { key: string; value: number }[] } | null;
  summary?: string;
}

export async function executeQueryDSL(crmId: number, def: CrmBlueprintDef, dsl: QueryDSL): Promise<QueryResultPayload> {
  const where = buildWhere(crmId, dsl);
  const entity = findEntity(def, dsl.entity)!;

  // Aggregate path
  if (dsl.aggregate) {
    const a = dsl.aggregate;
    if (a.groupBy) {
      const groupExpr = sql`(${crmRecordsTable.data} ->> ${a.groupBy})`;
      let metricExpr = sql`count(*)::numeric`;
      if (a.field && a.op !== "count") {
        const num = sql`((${crmRecordsTable.data} ->> ${a.field})::numeric)`;
        if (a.op === "sum") metricExpr = sql`coalesce(sum(${num}), 0)`;
        else if (a.op === "avg") metricExpr = sql`coalesce(avg(${num}), 0)`;
        else if (a.op === "min") metricExpr = sql`min(${num})`;
        else if (a.op === "max") metricExpr = sql`max(${num})`;
      }
      const rows = await db.execute(sql`
        SELECT ${groupExpr} AS k, ${metricExpr} AS v
        FROM ${crmRecordsTable}
        WHERE ${where}
        GROUP BY k
        ORDER BY v DESC
        LIMIT 50
      `);
      const groups = (rows as unknown as { rows: { k: string; v: string }[] }).rows.map((r) => ({
        key: r.k ?? "(none)",
        value: Number(r.v),
      }));
      const total = groups.reduce((s, g) => s + g.value, 0);
      return {
        output: "chart",
        rows: groups.map((g) => ({ [a.groupBy!]: g.key, value: g.value })),
        columns: [a.groupBy!, "value"],
        totalRows: groups.length,
        aggregate: { op: a.op, value: total, groupBy: groups },
      };
    }
    let metricExpr = sql`count(*)::numeric`;
    if (a.field && a.op !== "count") {
      const num = sql`((${crmRecordsTable.data} ->> ${a.field})::numeric)`;
      if (a.op === "sum") metricExpr = sql`coalesce(sum(${num}), 0)`;
      else if (a.op === "avg") metricExpr = sql`coalesce(avg(${num}), 0)`;
      else if (a.op === "min") metricExpr = sql`min(${num})`;
      else if (a.op === "max") metricExpr = sql`max(${num})`;
    }
    const r = await db.execute(sql`SELECT ${metricExpr} AS v FROM ${crmRecordsTable} WHERE ${where}`);
    const v = Number((r as unknown as { rows: { v: string }[] }).rows[0]?.v ?? 0);
    return {
      output: "summary",
      rows: [{ value: v }],
      columns: ["value"],
      totalRows: 1,
      aggregate: { op: a.op, value: v },
      summary: `${a.op}${a.field ? `(${a.field})` : ""} = ${v}`,
    };
  }

  // Row-listing path
  const limit = dsl.limit ? Math.min(dsl.limit, 500) : 100;
  let queryRows;
  if (dsl.sort) {
    const dir = dsl.sort.order === "asc" ? sql`ASC` : sql`DESC`;
    queryRows = await db.execute(sql`
      SELECT id, data, needs_review, warnings
      FROM ${crmRecordsTable}
      WHERE ${where}
      ORDER BY (${crmRecordsTable.data} ->> ${dsl.sort.field}) ${dir}
      LIMIT ${limit}
    `);
  } else {
    queryRows = await db.execute(sql`
      SELECT id, data, needs_review, warnings
      FROM ${crmRecordsTable}
      WHERE ${where}
      ORDER BY id ASC
      LIMIT ${limit}
    `);
  }
  const totalQ = await db.execute(sql`SELECT count(*)::int AS c FROM ${crmRecordsTable} WHERE ${where}`);
  const totalRows = Number((totalQ as unknown as { rows: { c: number }[] }).rows[0]?.c ?? 0);

  const fields = dsl.project && dsl.project.length > 0 ? dsl.project : entity.fields.map((f) => f.name);
  const rows = (queryRows as unknown as { rows: { id: number; data: Record<string, unknown> }[] }).rows.map((r) => {
    const out: Record<string, unknown> = { __id: r.id };
    for (const f of fields) out[f] = r.data?.[f] ?? null;
    return out;
  });

  return {
    output: dsl.output,
    columns: ["__id", ...fields],
    rows,
    totalRows,
  };
}

export async function previewMutationCount(crmId: number, dsl: MutationDSL): Promise<number> {
  const where = buildWhere(crmId, dsl);
  const r = await db.execute(sql`SELECT count(*)::int AS c FROM ${crmRecordsTable} WHERE ${where}`);
  return Number((r as unknown as { rows: { c: number }[] }).rows[0]?.c ?? 0);
}

export async function executeMutationDSL(crmId: number, dsl: MutationDSL): Promise<{ affected: number }> {
  const where = buildWhere(crmId, dsl);
  const matchedR = await db.execute(sql`SELECT id FROM ${crmRecordsTable} WHERE ${where}`);
  const ids = (matchedR as unknown as { rows: { id: number }[] }).rows.map((r) => r.id);
  if (ids.length === 0) return { affected: 0 };

  const a = dsl.action;
  if (a.op === "delete") {
    const result = await db.execute(sql`DELETE FROM ${crmRecordsTable} WHERE id = ANY(${ids}) AND crm_id = ${crmId}`);
    void result;
    return { affected: ids.length };
  }
  if (a.op === "tag") {
    await db.execute(sql`
      UPDATE ${crmRecordsTable}
      SET data = jsonb_set(
        data,
        '{__tags}',
        COALESCE(data -> '__tags', '[]'::jsonb) || to_jsonb(ARRAY[${a.value}]::text[]),
        true
      )
      WHERE id = ANY(${ids}) AND crm_id = ${crmId}
        AND NOT (COALESCE(data -> '__tags', '[]'::jsonb) @> to_jsonb(ARRAY[${a.value}]::text[]))
    `);
    return { affected: ids.length };
  }
  if (a.op === "untag") {
    await db.execute(sql`
      UPDATE ${crmRecordsTable}
      SET data = jsonb_set(
        data,
        '{__tags}',
        COALESCE((SELECT jsonb_agg(t) FROM jsonb_array_elements_text(data -> '__tags') t WHERE t <> ${a.value}), '[]'::jsonb),
        true
      )
      WHERE id = ANY(${ids}) AND crm_id = ${crmId}
    `);
    return { affected: ids.length };
  }
  // set_field
  await db.execute(sql`
    UPDATE ${crmRecordsTable}
    SET data = jsonb_set(data, ${"{" + a.field + "}"}, to_jsonb(${a.value as string | number | boolean | null}::text), true)
    WHERE id = ANY(${ids}) AND crm_id = ${crmId}
  `);
  return { affected: ids.length };
}

/* -------------------------------------------------------------------- */
/* NL → DSL translator                                                   */
/* -------------------------------------------------------------------- */

function blueprintForPrompt(def: CrmBlueprintDef): string {
  return JSON.stringify(
    {
      entities: def.entities.map((e) => ({
        name: e.name,
        fields: e.fields.map((f) => ({ name: f.name, type: f.type, label: f.label })),
      })),
    },
    null,
    2,
  );
}

const SYSTEM_PROMPT = `You translate natural-language CRM questions into a JSON DSL. Output ONLY valid JSON, no prose, no markdown fences.

Available DSL shapes:
{ "kind":"query", "entity":"<entityName>", "filters":[{"field":"<fieldName>","op":"<op>","value":<v>}], "sort":{"field":"<fieldName>","order":"asc"|"desc"}|null, "limit":<int>|null, "aggregate":{"op":"count"|"sum"|"avg"|"min"|"max","field":"<fieldName>"|null,"groupBy":"<fieldName>"|null}|null, "project":["<fieldName>"]|null, "output":"table"|"chart"|"summary" }
{ "kind":"mutation", "entity":"<entityName>", "filters":[...], "action":{"op":"tag"|"untag","value":"<tag>"} | {"op":"delete"} | {"op":"set_field","field":"<fieldName>","value":<v>} }

Filter ops: eq, neq, gt, gte, lt, lte, contains, starts_with, ends_with, in, not_in, is_null, is_not_null, before, after.
Use only entity and field names defined in the schema below. If the question implies a write/bulk action, use kind=mutation. Otherwise kind=query. Default output: "table" for lists, "chart" for groupBy aggregates, "summary" for single-number aggregates.
The virtual field "__tags" can be used in filters with op "contains" to match a tag value.
`;

export async function translateNLToDSL(question: string, def: CrmBlueprintDef): Promise<DSL> {
  if (def.entities.length === 0) throw new DSLValidationError("CRM has no entities");
  const schemaJson = blueprintForPrompt(def);
  const userMsg = `SCHEMA:\n${schemaJson}\n\nQUESTION:\n${question}\n\nReturn ONLY the DSL JSON.`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
  });
  const text = resp.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new DSLValidationError("Translator returned non-JSON output");
    parsed = JSON.parse(m[0]);
  }
  return validateDSL(parsed, def);
}

export async function summarizeQueryResult(question: string, dsl: DSL, payload: QueryResultPayload): Promise<string> {
  // Cheap deterministic fallback summary; LLM polish optional.
  if (dsl.kind === "query" && dsl.aggregate) {
    if (dsl.aggregate.groupBy && payload.aggregate?.groupBy) {
      const top = payload.aggregate.groupBy.slice(0, 3).map((g) => `${g.key}: ${g.value}`).join(", ");
      return `Grouped ${dsl.entity} by ${dsl.aggregate.groupBy} (${dsl.aggregate.op}). Top: ${top}.`;
    }
    return `${dsl.aggregate.op}${dsl.aggregate.field ? `(${dsl.aggregate.field})` : ""} of ${dsl.entity} = ${payload.aggregate?.value ?? 0}.`;
  }
  return `Found ${payload.totalRows} ${dsl.entity}${payload.totalRows === 1 ? "" : "s"} matching your question.`;
}

export async function getCrmDef(crmId: number): Promise<{ name: string; def: CrmBlueprintDef } | null> {
  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, crmId));
  if (!crm) return null;
  return { name: crm.name, def: crm.definition as CrmBlueprintDef };
}
