import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  botsTable,
  crmBlueprintsTable,
  crmRecordsTable,
  crmInsightsTable,
  rebuildJobsTable,
  type CrmBlueprintDef,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { executeQueryDSL, type QueryDSL } from "./nl-query";

interface StewardPersona {
  name: string;
  title: string;
  description: string;
  personality: string;
}

const FALLBACK_NAMES = ["Atlas", "Orion", "Vega", "Lyra", "Mira", "Rigel", "Nova", "Cygnus", "Helio", "Sirius"];

function pickFallback(crmId: number): StewardPersona {
  const name = FALLBACK_NAMES[crmId % FALLBACK_NAMES.length];
  return {
    name,
    title: "CRM Steward",
    description: "Autonomous steward bot bound to a Liberator CRM. Monitors data quality, surfaces anomalies, and answers questions over its CRM.",
    personality: "Calm, observant, precise. Reports facts about the CRM it watches and flags anything unusual without speculation.",
  };
}

export async function generateStewardPersona(crmName: string, def: CrmBlueprintDef, sample: Record<string, unknown>[]): Promise<StewardPersona> {
  const fields = def.entities[0]?.fields.map((f) => `${f.name}:${f.type}`).join(", ") ?? "";
  const sampleStr = JSON.stringify(sample.slice(0, 3));
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You name and characterize a 'CRM Steward' bot for a freshly-built Liberator CRM. Output JSON with keys: name (one short distinctive proper noun), title (e.g. 'Steward of <CRM name>'), description (1-2 sentences), personality (1-2 sentences). No prose outside JSON.`,
        },
        {
          role: "user",
          content: `CRM: ${crmName}\nFields: ${fields}\nSample rows: ${sampleStr}`,
        },
      ],
    });
    const text = resp.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    if (parsed?.name && parsed?.title) {
      return {
        name: String(parsed.name).slice(0, 64),
        title: String(parsed.title).slice(0, 128),
        description: String(parsed.description ?? "").slice(0, 500) || "Steward bot bound to a Liberator CRM.",
        personality: String(parsed.personality ?? "").slice(0, 500) || "Calm, observant, precise.",
      };
    }
  } catch {
    // fall through
  }
  return pickFallback(0);
}

export async function getStewardForCrm(crmId: number) {
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.linkedCrmId, crmId)).limit(1);
  return bot ?? null;
}

export async function spawnStewardForCrm(crmId: number): Promise<typeof botsTable.$inferSelect | null> {
  const existing = await getStewardForCrm(crmId);
  if (existing) return existing;

  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, crmId));
  if (!crm) return null;

  const def = crm.definition as CrmBlueprintDef;
  const sample = await db
    .select({ data: crmRecordsTable.data })
    .from(crmRecordsTable)
    .where(eq(crmRecordsTable.crmId, crmId))
    .limit(5);

  const persona = await generateStewardPersona(
    crm.name,
    def,
    sample.map((r) => r.data as Record<string, unknown>),
  );

  const [bot] = await db
    .insert(botsTable)
    .values({
      name: persona.name,
      title: `${persona.title} — ${crm.name}`,
      department: "Liberator",
      category: "specialized",
      description: persona.description,
      responsibilities: [
        `Watch the "${crm.name}" CRM for unusual changes`,
        "Answer natural-language questions over the CRM data",
        "Surface anomalies as Insights",
      ],
      personality: persona.personality,
      rank: "analyst",
      isAvailable: true,
      isAiGenerated: true,
      linkedCrmId: crmId,
    })
    .returning();

  await db.insert(crmInsightsTable).values({
    crmId,
    botId: bot?.id ?? null,
    kind: "steward_spawned",
    severity: "info",
    title: `${persona.name} reporting for duty`,
    body: `${persona.name}, ${persona.title}, has been assigned as steward of "${crm.name}". I'll keep watch and flag anything unusual.`,
    metadata: {},
  });

  return bot ?? null;
}

/* -------------------------------------------------------------------- */
/* Anomaly checks                                                        */
/* -------------------------------------------------------------------- */

interface AnomalyResult {
  kind: string;
  severity: "info" | "warn" | "alert";
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

async function checkRecordCountDelta(crmId: number, def: CrmBlueprintDef): Promise<AnomalyResult | null> {
  const entityName = def.entities[0]?.name;
  if (!entityName) return null;

  const totalR = await db.execute(sql`SELECT count(*)::int AS c FROM ${crmRecordsTable} WHERE crm_id = ${crmId} AND entity_type = ${entityName}`);
  const total = Number((totalR as unknown as { rows: { c: number }[] }).rows[0]?.c ?? 0);

  const recentR = await db.execute(sql`
    SELECT count(*)::int AS c FROM ${crmRecordsTable}
    WHERE crm_id = ${crmId} AND entity_type = ${entityName}
      AND created_at > now() - interval '24 hours'
  `);
  const recent = Number((recentR as unknown as { rows: { c: number }[] }).rows[0]?.c ?? 0);
  if (total === 0) return null;
  const ratio = recent / total;
  if (recent >= 5 && ratio >= 0.3) {
    return {
      kind: "growth_spike",
      severity: "warn",
      title: `${recent} new ${entityName} added in the last 24h`,
      body: `That's ${(ratio * 100).toFixed(0)}% of the total (${total}). Worth a quick look to make sure none of it is duplicate or junk data.`,
      metadata: { recent, total, ratio },
    };
  }
  return null;
}

async function checkFieldsSuddenlyEmpty(crmId: number, def: CrmBlueprintDef): Promise<AnomalyResult | null> {
  const entity = def.entities[0];
  if (!entity) return null;
  for (const field of entity.fields) {
    if (!field.required) continue;
    const r = await db.execute(sql`
      SELECT count(*)::int AS empty FROM ${crmRecordsTable}
      WHERE crm_id = ${crmId} AND entity_type = ${entity.name}
        AND (data ->> ${field.name}) IS NULL OR (data ->> ${field.name}) = ''
    `);
    const empty = Number((r as unknown as { rows: { empty: number }[] }).rows[0]?.empty ?? 0);
    if (empty > 0) {
      return {
        kind: "fields_empty",
        severity: "warn",
        title: `${empty} record${empty === 1 ? "" : "s"} missing required field "${field.label || field.name}"`,
        body: `Field "${field.name}" is marked required, but ${empty} record${empty === 1 ? " has" : "s have"} no value. You may want to backfill or relax the requirement.`,
        metadata: { field: field.name, empty },
      };
    }
  }
  return null;
}

async function checkConflictBacklog(crmId: number): Promise<AnomalyResult | null> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS c FROM ${crmRecordsTable}
    WHERE crm_id = ${crmId} AND needs_review = true
  `);
  const needs = Number((r as unknown as { rows: { c: number }[] }).rows[0]?.c ?? 0);
  if (needs >= 5) {
    return {
      kind: "conflict_backlog",
      severity: needs >= 25 ? "alert" : "warn",
      title: `${needs} record${needs === 1 ? "" : "s"} flagged for review`,
      body: `Your conflict / low-confidence backlog is at ${needs}. Resolving these keeps the CRM trustworthy.`,
      metadata: { needs },
    };
  }
  return null;
}

async function checkLowConfidence(crmId: number): Promise<AnomalyResult | null> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS c FROM ${crmRecordsTable}
    WHERE crm_id = ${crmId}
      AND jsonb_array_length(COALESCE(warnings, '[]'::jsonb)) > 0
  `);
  const warned = Number((r as unknown as { rows: { c: number }[] }).rows[0]?.c ?? 0);
  if (warned >= 10) {
    return {
      kind: "low_confidence",
      severity: "info",
      title: `${warned} records carry warnings`,
      body: `These rows committed with extraction warnings — accuracy may be lower than usual. Consider re-running with stricter confidence thresholds.`,
      metadata: { warned },
    };
  }
  return null;
}

export async function runAnomalyChecksForCrm(crmId: number): Promise<AnomalyResult[]> {
  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, crmId));
  if (!crm) return [];
  const def = crm.definition as CrmBlueprintDef;
  if (def.entities.length === 0) return [];

  const checks = await Promise.all([
    checkRecordCountDelta(crmId, def).catch(() => null),
    checkFieldsSuddenlyEmpty(crmId, def).catch(() => null),
    checkConflictBacklog(crmId).catch(() => null),
    checkLowConfidence(crmId).catch(() => null),
  ]);
  const results = checks.filter((r): r is AnomalyResult => !!r);

  if (results.length > 0) {
    const bot = await getStewardForCrm(crmId);
    for (const a of results) {
      // Avoid posting an identical insight if one with the same kind was
      // posted in the last 24h.
      const recent = await db
        .select({ id: crmInsightsTable.id })
        .from(crmInsightsTable)
        .where(
          and(
            eq(crmInsightsTable.crmId, crmId),
            eq(crmInsightsTable.kind, a.kind),
            sql`${crmInsightsTable.observedAt} > now() - interval '24 hours'`,
          ),
        )
        .limit(1);
      if (recent.length > 0) continue;

      await db.insert(crmInsightsTable).values({
        crmId,
        botId: bot?.id ?? null,
        kind: a.kind,
        severity: a.severity,
        title: a.title,
        body: a.body,
        metadata: a.metadata ?? {},
      });
    }
  }
  return results;
}

export async function listInsightsForCrm(crmId: number, limit = 20) {
  return db
    .select()
    .from(crmInsightsTable)
    .where(eq(crmInsightsTable.crmId, crmId))
    .orderBy(desc(crmInsightsTable.observedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/** Light-weight wrapper exposing the steward's bounded query tool. */
export async function stewardQuery(crmId: number, def: CrmBlueprintDef, dsl: QueryDSL) {
  return executeQueryDSL(crmId, def, dsl);
}

export async function listCommittedCrmIds(): Promise<number[]> {
  const rows = await db
    .select({ id: crmBlueprintsTable.id })
    .from(crmBlueprintsTable)
    .where(eq(crmBlueprintsTable.status, "committed"));
  return rows.map((r) => r.id);
}

// Mark variable as used to silence unused-import warnings.
void rebuildJobsTable;
