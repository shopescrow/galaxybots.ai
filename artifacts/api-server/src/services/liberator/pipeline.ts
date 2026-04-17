import { eq, and, sql } from "drizzle-orm";
import {
  db,
  rebuildJobsTable,
  crmBlueprintsTable,
  crmRecordsTable,
  extractionJobsTable,
  extractionPagesTable,
  type CrmBlueprintDef,
  type CrmEntityDef,
  type PipelineRecipe,
  type PipelineStageName,
  type PipelineStageState,
  type DedupCluster,
  type IdentityLink,
  type DryRunRow,
  type RecordWarning,
  type CellProvenance,
} from "@workspace/db";
import {
  applyTransformChain,
  defaultTransformsForType,
  type TransformId,
} from "./transforms";
import { generateEmbedding } from "../bots/memory";

const STAGES: PipelineStageName[] = ["normalize", "dedupe", "resolve", "dryrun", "commit"];

const EMBEDDING_DEDUP_THRESHOLD = 0.92;
const EMBEDDING_LINK_THRESHOLD = 0.85;
const FUZZY_DEDUP_THRESHOLD = 0.92;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function nowISO() {
  return new Date().toISOString();
}

function emptyStages(): Record<PipelineStageName, PipelineStageState> {
  const out = {} as Record<PipelineStageName, PipelineStageState>;
  for (const s of STAGES) out[s] = { status: "pending" };
  return out;
}

function buildDefaultRecipe(def: CrmBlueprintDef): PipelineRecipe {
  const fields: Record<string, { transforms: string[] }> = {};
  for (const entity of def.entities) {
    for (const f of entity.fields) {
      const key = `${entity.name}.${f.name}`;
      fields[key] = { transforms: defaultTransformsForType(f.type) };
    }
  }
  return { fields, confidenceThreshold: 0.6 };
}

function recipeFor(recipe: PipelineRecipe, entityName: string, fieldName: string): TransformId[] {
  const scoped = recipe.fields[`${entityName}.${fieldName}`];
  if (scoped) return scoped.transforms as TransformId[];
  const flat = recipe.fields[fieldName];
  return (flat?.transforms ?? []) as TransformId[];
}

interface SourceRow {
  rowId: number;
  values: Record<string, unknown>;
  meta?: {
    sourcePageId?: number;
    pageNumber?: number;
    confidence?: Record<string, number>;
    region?: { x: number; y: number; w: number; h: number } | null;
    regions?: Record<string, { x: number; y: number; w: number; h: number }>;
  };
}

async function loadSourceRows(sourceJobId: number | null | undefined): Promise<SourceRow[]> {
  if (!sourceJobId) return [];
  const pages = await db
    .select()
    .from(extractionPagesTable)
    .where(eq(extractionPagesTable.jobId, sourceJobId))
    .orderBy(extractionPagesTable.pageNumber);

  const out: SourceRow[] = [];
  let nextId = 1;
  for (const p of pages) {
    const rows = (p.extractedRows as Record<string, unknown>[]) ?? [];
    for (const raw of rows) {
      const meta = (raw && typeof raw === "object" ? (raw as Record<string, unknown>)["__meta"] : null) as
        | { confidence?: Record<string, number>; region?: CellProvenance["region"]; regions?: CellProvenance["regions"] }
        | undefined;
      const values: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === "__meta") continue;
        values[k] = v;
      }
      out.push({
        rowId: nextId++,
        values,
        meta: {
          sourcePageId: p.id,
          pageNumber: p.pageNumber,
          confidence: meta?.confidence,
          region: meta?.region ?? null,
          regions: meta?.regions,
        },
      });
    }
  }

  if (out.length === 0) {
    const [job] = await db
      .select()
      .from(extractionJobsTable)
      .where(eq(extractionJobsTable.id, sourceJobId));
    const rows = (job?.extractedData as Record<string, unknown>[]) ?? [];
    for (const raw of rows) {
      const meta = (raw && typeof raw === "object" ? (raw as Record<string, unknown>)["__meta"] : null) as
        | { confidence?: Record<string, number> }
        | undefined;
      const values: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === "__meta") continue;
        values[k] = v;
      }
      out.push({
        rowId: nextId++,
        values,
        meta: { sourcePageId: undefined, pageNumber: undefined, confidence: meta?.confidence, region: null },
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Normalize                                                           */
/* ------------------------------------------------------------------ */

interface NormalizedRow {
  rowId: number;
  entityType: string;
  data: Record<string, unknown>;
  warnings: RecordWarning[];
  provenance: CellProvenance;
  needsReview: boolean;
}

function rowHasAnyValue(values: Record<string, unknown>, entity: CrmEntityDef): boolean {
  for (const f of entity.fields) {
    const v = values[f.sourceField || f.name];
    if (v !== undefined && v !== null && v !== "") return true;
  }
  return false;
}

function normalizeForEntity(
  rows: SourceRow[],
  entity: CrmEntityDef,
  recipe: PipelineRecipe,
  rowIdOffset: number
): { rows: NormalizedRow[]; warningCount: number } {
  const out: NormalizedRow[] = [];
  let warningCount = 0;
  let nextId = rowIdOffset;

  for (const r of rows) {
    if (!rowHasAnyValue(r.values, entity)) continue;

    const data: Record<string, unknown> = {};
    const rowWarnings: RecordWarning[] = [];

    for (const f of entity.fields) {
      const sourceKey = f.sourceField || f.name;
      const raw = r.values[sourceKey];
      const tf = recipeFor(recipe, entity.name, f.name).length > 0
        ? recipeFor(recipe, entity.name, f.name)
        : (defaultTransformsForType(f.type) as TransformId[]);
      const result = applyTransformChain(tf, raw);
      data[f.name] = result.value;

      for (const w of result.warnings) {
        rowWarnings.push({ field: f.name, code: w.code, message: w.message, severity: "warn" });
        warningCount++;
      }

      if (f.required && (result.value === null || result.value === undefined || result.value === "")) {
        rowWarnings.push({
          field: f.name,
          code: "required_missing",
          message: `Required field "${f.label || f.name}" is missing`,
          severity: "error",
        });
        warningCount++;
      }
    }

    const confidence = r.meta?.confidence ?? {};
    let lowConfCount = 0;
    for (const [, score] of Object.entries(confidence)) {
      if (score < recipe.confidenceThreshold) lowConfCount++;
    }
    if (lowConfCount > 0) {
      rowWarnings.push({
        code: "low_confidence",
        message: `Low confidence on ${lowConfCount} cell(s)`,
        severity: "info",
      });
      warningCount++;
    }

    // Anything more serious than purely informational counts as needs-review:
    // errors (required missing), warnings (parse failures, malformed values),
    // or low-confidence cells from vision extraction.
    const needsReview =
      rowWarnings.some((w) => w.severity === "error" || w.severity === "warn") ||
      lowConfCount > 0;

    out.push({
      rowId: nextId++,
      entityType: entity.name,
      data,
      warnings: rowWarnings,
      provenance: {
        sourcePageId: r.meta?.sourcePageId,
        pageNumber: r.meta?.pageNumber,
        confidence,
        region: r.meta?.region ?? null,
        regions: r.meta?.regions,
        rawValues: r.values,
      },
      needsReview,
    });
  }

  return { rows: out, warningCount };
}

/* ------------------------------------------------------------------ */
/* Dedupe (deterministic + fuzzy + embedding)                          */
/* ------------------------------------------------------------------ */

function rowSignature(row: NormalizedRow, entity: CrmEntityDef): string | null {
  const emailField = entity.fields.find((f) => f.type === "email");
  if (emailField) {
    const v = row.data[emailField.name];
    if (typeof v === "string" && v) return `email:${v.toLowerCase()}`;
  }
  const phoneField = entity.fields.find((f) => f.type === "phone");
  if (phoneField) {
    const v = row.data[phoneField.name];
    if (typeof v === "string" && v) return `phone:${v.replace(/\D/g, "")}`;
  }
  const primary = entity.primaryDisplayField;
  if (primary) {
    const v = row.data[primary];
    if (typeof v === "string" && v.trim() !== "") {
      return `primary:${v.trim().toLowerCase()}`;
    }
  }
  return null;
}

function jaroWinkler(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - range);
    const end = Math.min(i + range + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let trans = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) trans++;
    k++;
  }
  trans = trans / 2;
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - trans) / m) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

function rowEmbeddingText(row: NormalizedRow, entity: CrmEntityDef): string {
  const parts: string[] = [];
  for (const f of entity.fields) {
    const v = row.data[f.name];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "object") continue;
    parts.push(`${f.label || f.name}: ${String(v)}`);
  }
  return parts.join(" | ");
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedRows(rows: NormalizedRow[], entity: CrmEntityDef): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  const work = rows
    .map((r) => ({ r, text: rowEmbeddingText(r, entity) }))
    .filter((x) => x.text.length > 0);
  // Conservative cap: skip embeddings on very large sets to bound cost; deterministic + fuzzy still apply.
  const MAX = 200;
  const subset = work.slice(0, MAX);
  // Sequential to avoid bursting; openai client supports batched input but kept simple.
  for (const x of subset) {
    try {
      const v = await generateEmbedding(x.text);
      out.set(x.r.rowId, v);
    } catch {
      // Skip on failure — fuzzy/deterministic still produce clusters.
    }
  }
  return out;
}

async function dedupeForEntity(
  rows: NormalizedRow[],
  entity: CrmEntityDef,
  startId: number
): Promise<{ clusters: DedupCluster[]; embeddings: Map<number, number[]>; nextId: number }> {
  let cId = startId;
  const clusters: DedupCluster[] = [];

  // 1. Deterministic signature buckets
  const buckets = new Map<string, NormalizedRow[]>();
  const unsigned: NormalizedRow[] = [];
  for (const r of rows) {
    const sig = rowSignature(r, entity);
    if (sig === null) {
      unsigned.push(r);
      continue;
    }
    const arr = buckets.get(sig) ?? [];
    arr.push(r);
    buckets.set(sig, arr);
  }
  const claimed = new Set<number>();
  for (const [sig, group] of buckets) {
    if (group.length < 2) continue;
    for (const g of group) claimed.add(g.rowId);
    clusters.push({
      id: `c${cId++}`,
      entityType: entity.name,
      rowIds: group.map((g) => g.rowId),
      representativeRowId: group[0].rowId,
      similarity: 1,
      signal: `Exact match on ${sig.split(":")[0]}`,
      method: "exact",
      status: "proposed",
      preview: group.slice(0, 4).map((g) => g.data),
    });
  }

  // 2. Fuzzy on primary
  const primary = entity.primaryDisplayField;
  if (primary) {
    const visited = new Set<number>();
    for (let i = 0; i < unsigned.length; i++) {
      if (visited.has(unsigned[i].rowId)) continue;
      const a = String(unsigned[i].data[primary] ?? "").toLowerCase().trim();
      if (!a) continue;
      const cluster: NormalizedRow[] = [unsigned[i]];
      for (let j = i + 1; j < unsigned.length; j++) {
        if (visited.has(unsigned[j].rowId)) continue;
        const b = String(unsigned[j].data[primary] ?? "").toLowerCase().trim();
        if (!b) continue;
        const sim = jaroWinkler(a, b);
        if (sim >= FUZZY_DEDUP_THRESHOLD) {
          cluster.push(unsigned[j]);
          visited.add(unsigned[j].rowId);
        }
      }
      if (cluster.length > 1) {
        visited.add(unsigned[i].rowId);
        for (const c of cluster) claimed.add(c.rowId);
        clusters.push({
          id: `c${cId++}`,
          entityType: entity.name,
          rowIds: cluster.map((r) => r.rowId),
          representativeRowId: cluster[0].rowId,
          similarity: FUZZY_DEDUP_THRESHOLD,
          signal: `Fuzzy name match on "${primary}"`,
          method: "fuzzy",
          status: "proposed",
          preview: cluster.slice(0, 4).map((r) => r.data),
        });
      }
    }
  }

  // 3. Embedding-based clustering for rows still unclaimed
  const remaining = rows.filter((r) => !claimed.has(r.rowId));
  const embeddings = await embedRows(remaining, entity);
  const embRowIds = Array.from(embeddings.keys());
  const visitedE = new Set<number>();
  for (let i = 0; i < embRowIds.length; i++) {
    const aId = embRowIds[i];
    if (visitedE.has(aId)) continue;
    const aVec = embeddings.get(aId)!;
    const aRow = remaining.find((r) => r.rowId === aId)!;
    const cluster: NormalizedRow[] = [aRow];
    let maxSim = 0;
    for (let j = i + 1; j < embRowIds.length; j++) {
      const bId = embRowIds[j];
      if (visitedE.has(bId)) continue;
      const bVec = embeddings.get(bId)!;
      const sim = cosine(aVec, bVec);
      if (sim >= EMBEDDING_DEDUP_THRESHOLD) {
        const bRow = remaining.find((r) => r.rowId === bId)!;
        cluster.push(bRow);
        visitedE.add(bId);
        if (sim > maxSim) maxSim = sim;
      }
    }
    if (cluster.length > 1) {
      visitedE.add(aId);
      clusters.push({
        id: `c${cId++}`,
        entityType: entity.name,
        rowIds: cluster.map((r) => r.rowId),
        representativeRowId: cluster[0].rowId,
        similarity: maxSim || EMBEDDING_DEDUP_THRESHOLD,
        signal: `Vector similarity (cosine ≥ ${EMBEDDING_DEDUP_THRESHOLD})`,
        method: "embedding",
        status: "proposed",
        preview: cluster.slice(0, 4).map((r) => r.data),
      });
    }
  }

  return { clusters, embeddings, nextId: cId };
}

/* ------------------------------------------------------------------ */
/* Identity resolution (cross-entity FK overlap + embedding similarity)*/
/* ------------------------------------------------------------------ */

function isIdentifierField(name: string): boolean {
  return /id$|^id|number$|code$|email|phone/i.test(name);
}

function resolveIdentitiesAcrossEntities(
  perEntity: Map<string, NormalizedRow[]>,
  perEntityEmbeddings: Map<string, Map<number, number[]>>,
  def: CrmBlueprintDef,
  startId: number
): { links: IdentityLink[]; nextId: number } {
  const links: IdentityLink[] = [];
  let lid = startId;

  const entities = def.entities;

  // 1. Within-entity shared identifier (id-like field reuse)
  for (const entity of entities) {
    const rows = perEntity.get(entity.name) ?? [];
    const idFields = entity.fields.filter((f) => isIdentifierField(f.name));
    for (const f of idFields) {
      const byVal = new Map<string, number[]>();
      for (const r of rows) {
        const v = r.data[f.name];
        if (v === null || v === undefined || v === "") continue;
        const k = String(v).toLowerCase();
        const arr = byVal.get(k) ?? [];
        arr.push(r.rowId);
        byVal.set(k, arr);
      }
      for (const [val, ids] of byVal) {
        if (ids.length < 2) continue;
        for (let i = 1; i < ids.length; i++) {
          links.push({
            id: `l${lid++}`,
            fromEntityType: entity.name,
            fromRowId: ids[0],
            toEntityType: entity.name,
            toRowId: ids[i],
            signal: `Shared ${f.label || f.name} = "${val}"`,
            similarity: 1,
            method: "shared_identifier",
            status: "proposed",
          });
        }
      }
    }
  }

  // 2. Cross-entity FK overlap: a value in entity A's id-like field matches
  //    the same value in entity B's id-like field.
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      const aRows = perEntity.get(a.name) ?? [];
      const bRows = perEntity.get(b.name) ?? [];
      const aIdFields = a.fields.filter((f) => isIdentifierField(f.name));
      const bIdFields = b.fields.filter((f) => isIdentifierField(f.name));
      if (aIdFields.length === 0 || bIdFields.length === 0) continue;

      // Build lookup: value -> rowId for entity B
      const bIndex = new Map<string, { rowId: number; field: string }[]>();
      for (const r of bRows) {
        for (const f of bIdFields) {
          const v = r.data[f.name];
          if (v === null || v === undefined || v === "") continue;
          const k = String(v).toLowerCase();
          const arr = bIndex.get(k) ?? [];
          arr.push({ rowId: r.rowId, field: f.name });
          bIndex.set(k, arr);
        }
      }
      for (const r of aRows) {
        for (const f of aIdFields) {
          const v = r.data[f.name];
          if (v === null || v === undefined || v === "") continue;
          const k = String(v).toLowerCase();
          const matches = bIndex.get(k);
          if (!matches) continue;
          for (const m of matches) {
            links.push({
              id: `l${lid++}`,
              fromEntityType: a.name,
              fromRowId: r.rowId,
              toEntityType: b.name,
              toRowId: m.rowId,
              signal: `FK overlap: ${a.name}.${f.name} ↔ ${b.name}.${m.field} = "${k}"`,
              similarity: 1,
              method: "fk_overlap",
              status: "proposed",
            });
          }
        }
      }

      // 3. Embedding similarity between primary fields across entities
      const aEmb = perEntityEmbeddings.get(a.name);
      const bEmb = perEntityEmbeddings.get(b.name);
      if (aEmb && bEmb && aEmb.size > 0 && bEmb.size > 0) {
        const aIds = Array.from(aEmb.keys());
        const bIds = Array.from(bEmb.keys());
        // Cap pairs to avoid O(N*M) blowup
        const CAP_A = Math.min(aIds.length, 50);
        const CAP_B = Math.min(bIds.length, 50);
        for (let x = 0; x < CAP_A; x++) {
          const av = aEmb.get(aIds[x])!;
          for (let y = 0; y < CAP_B; y++) {
            const bv = bEmb.get(bIds[y])!;
            const sim = cosine(av, bv);
            if (sim >= EMBEDDING_LINK_THRESHOLD) {
              links.push({
                id: `l${lid++}`,
                fromEntityType: a.name,
                fromRowId: aIds[x],
                toEntityType: b.name,
                toRowId: bIds[y],
                signal: `Vector similarity (cosine ${sim.toFixed(2)})`,
                similarity: sim,
                method: "embedding",
                status: "proposed",
              });
            }
          }
        }
      }
    }
  }

  // De-duplicate identical (from,to) pairs keeping the strongest.
  const dedupKey = (l: IdentityLink) =>
    `${l.fromEntityType}:${l.fromRowId}->${l.toEntityType}:${l.toRowId}`;
  const best = new Map<string, IdentityLink>();
  for (const l of links) {
    const k = dedupKey(l);
    const cur = best.get(k);
    if (!cur || l.similarity > cur.similarity) best.set(k, l);
  }
  return { links: Array.from(best.values()), nextId: lid };
}

/* ------------------------------------------------------------------ */
/* Pipeline runner                                                     */
/* ------------------------------------------------------------------ */

async function setStage(
  jobId: number,
  stage: PipelineStageName,
  patch: Partial<PipelineStageState>,
  extra: Partial<{
    status: typeof rebuildJobsTable.$inferInsert.status;
    currentStage: PipelineStageName;
    rowsIn: number;
    rowsOut: number;
    errorMessage: string | null;
  }> = {}
): Promise<void> {
  const [job] = await db.select().from(rebuildJobsTable).where(eq(rebuildJobsTable.id, jobId));
  if (!job) return;
  const stages = { ...(job.stages as Record<PipelineStageName, PipelineStageState>) };
  stages[stage] = { ...stages[stage], ...patch };
  const set: Record<string, unknown> = { stages };
  if (extra.status) set.status = extra.status;
  if (extra.currentStage) set.currentStage = extra.currentStage;
  if (extra.rowsIn !== undefined) set.rowsIn = extra.rowsIn;
  if (extra.rowsOut !== undefined) set.rowsOut = extra.rowsOut;
  if (extra.errorMessage !== undefined) set.errorMessage = extra.errorMessage;
  await db.update(rebuildJobsTable).set(set).where(eq(rebuildJobsTable.id, jobId));
}

export async function getOrCreateRebuildJob(crmId: number): Promise<number> {
  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, crmId));
  if (!crm) throw new Error("CRM not found");

  const existing = await db
    .select()
    .from(rebuildJobsTable)
    .where(eq(rebuildJobsTable.crmId, crmId));
  const sorted = existing.sort((a, b) => b.id - a.id);
  const reusable = sorted.find((j) => j.status !== "committed");
  if (reusable) return reusable.id;

  const def = crm.definition as CrmBlueprintDef;
  // Carry the recipe forward across reruns: prefer the most recent prior
  // job's recipe (which may be user-edited) over the type-driven defaults.
  const priorRecipe = sorted[0]?.recipe as PipelineRecipe | undefined;
  const recipe =
    priorRecipe && Object.keys(priorRecipe.fields ?? {}).length > 0
      ? priorRecipe
      : def.entities.length > 0
      ? buildDefaultRecipe(def)
      : { fields: {}, confidenceThreshold: 0.6 };

  const [created] = await db
    .insert(rebuildJobsTable)
    .values({
      crmId,
      sourceJobId: crm.sourceJobId ?? null,
      status: "pending",
      currentStage: "normalize",
      stages: emptyStages(),
      recipe,
    })
    .returning();
  return created.id;
}

export async function runPipelineToReview(jobId: number): Promise<void> {
  const [job] = await db.select().from(rebuildJobsTable).where(eq(rebuildJobsTable.id, jobId));
  if (!job) return;

  await db
    .update(rebuildJobsTable)
    .set({ status: "running", currentStage: "normalize", errorMessage: null })
    .where(eq(rebuildJobsTable.id, jobId));

  try {
    const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, job.crmId));
    if (!crm) throw new Error("CRM not found");
    const def = crm.definition as CrmBlueprintDef;
    if (def.entities.length === 0) throw new Error("Blueprint has no entities");

    // Stage 1 — normalize across all entities
    await setStage(jobId, "normalize", { status: "running", startedAt: nowISO() }, { currentStage: "normalize" });
    const sourceRows = await loadSourceRows(job.sourceJobId);
    const perEntity = new Map<string, NormalizedRow[]>();
    let totalNormalized = 0;
    let totalWarnings = 0;
    let nextRowId = 1;
    for (const entity of def.entities) {
      const { rows, warningCount } = normalizeForEntity(sourceRows, entity, job.recipe as PipelineRecipe, nextRowId);
      perEntity.set(entity.name, rows);
      totalNormalized += rows.length;
      totalWarnings += warningCount;
      nextRowId += rows.length;
    }
    await setStage(
      jobId,
      "normalize",
      {
        status: "done",
        finishedAt: nowISO(),
        rowsIn: sourceRows.length,
        rowsOut: totalNormalized,
        warnings: totalWarnings,
        message: `${def.entities.length} entit${def.entities.length === 1 ? "y" : "ies"} normalized`,
      },
      { rowsIn: sourceRows.length }
    );

    // Stage 2 — dedupe per entity (deterministic + fuzzy + embedding)
    await setStage(jobId, "dedupe", { status: "running", startedAt: nowISO() }, { currentStage: "dedupe" });
    const allClusters: DedupCluster[] = [];
    const perEntityEmbeddings = new Map<string, Map<number, number[]>>();
    let cId = 1;
    for (const entity of def.entities) {
      const rows = perEntity.get(entity.name) ?? [];
      const { clusters, embeddings, nextId } = await dedupeForEntity(rows, entity, cId);
      cId = nextId;
      allClusters.push(...clusters);
      perEntityEmbeddings.set(entity.name, embeddings);
    }
    await setStage(jobId, "dedupe", {
      status: "done",
      finishedAt: nowISO(),
      rowsIn: totalNormalized,
      rowsOut: totalNormalized,
      warnings: allClusters.length,
      message: `${allClusters.length} cluster(s) proposed (incl. embedding pass)`,
    });

    // Stage 3 — resolve identities (within + cross-entity)
    await setStage(jobId, "resolve", { status: "running", startedAt: nowISO() }, { currentStage: "resolve" });
    const { links } = resolveIdentitiesAcrossEntities(perEntity, perEntityEmbeddings, def, 1);
    await setStage(jobId, "resolve", {
      status: "done",
      finishedAt: nowISO(),
      rowsIn: totalNormalized,
      rowsOut: totalNormalized,
      warnings: links.length,
      message: `${links.length} identity link(s) proposed across ${def.entities.length} entit${def.entities.length === 1 ? "y" : "ies"}`,
    });

    // Stage 4 — dryrun
    await setStage(jobId, "dryrun", { status: "running", startedAt: nowISO() }, { currentStage: "dryrun" });
    const dryRun: DryRunRow[] = [];
    for (const entity of def.entities) {
      for (const r of perEntity.get(entity.name) ?? []) {
        dryRun.push({
          rowId: r.rowId,
          entityType: r.entityType,
          data: r.data,
          provenance: r.provenance,
          warnings: r.warnings,
          needsReview: r.needsReview,
        });
      }
    }
    await db
      .update(rebuildJobsTable)
      .set({
        dedupClusters: allClusters,
        identityLinks: links,
        dryRunRows: dryRun,
        rowsOut: dryRun.length,
        status: "awaiting_review",
        currentStage: "dryrun",
      })
      .where(eq(rebuildJobsTable.id, jobId));
    await setStage(jobId, "dryrun", {
      status: "done",
      finishedAt: nowISO(),
      rowsIn: totalNormalized,
      rowsOut: dryRun.length,
      warnings: dryRun.filter((r) => r.needsReview).length,
      message: `${dryRun.filter((r) => r.needsReview).length} row(s) flagged for review`,
    });

    await db
      .update(rebuildJobsTable)
      .set({ status: "ready_to_commit" })
      .where(eq(rebuildJobsTable.id, jobId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(rebuildJobsTable)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(rebuildJobsTable.id, jobId));
  }
}

export interface CommitResult {
  jobId: number;
  crmId: number;
  recordsLoaded: number;
  needsReview: number;
  duplicatesDropped: number;
  identityLinksApplied: number;
  perEntity: { entityType: string; loaded: number }[];
}

export async function commitPipeline(jobId: number): Promise<CommitResult> {
  const [job] = await db.select().from(rebuildJobsTable).where(eq(rebuildJobsTable.id, jobId));
  if (!job) throw new Error("Rebuild job not found");
  if (job.status !== "ready_to_commit" && job.status !== "awaiting_review") {
    throw new Error(`Pipeline is not ready to commit (status=${job.status})`);
  }

  const [crm] = await db.select().from(crmBlueprintsTable).where(eq(crmBlueprintsTable.id, job.crmId));
  if (!crm) throw new Error("CRM not found");
  const def = crm.definition as CrmBlueprintDef;
  if (def.entities.length === 0) throw new Error("Blueprint has no entities");

  await setStage(jobId, "commit", { status: "running", startedAt: nowISO() }, { currentStage: "commit", status: "running" });

  const dryRun = job.dryRunRows as DryRunRow[];
  const clusters = job.dedupClusters as DedupCluster[];
  const links = job.identityLinks as IdentityLink[];

  // Apply accepted clusters: keep representativeRowId, drop the others.
  // This is the EXACT same projection used by getLatestRebuildJobForCrm so
  // the user always commits what the dry-run preview showed.
  const { rows: finalRows, dropIds } = applyDecisionsToDryRun(dryRun, clusters);
  const acceptedLinks = links.filter((l) => l.status === "accepted");
  let needsReviewCount = 0;
  const perEntityCounts = new Map<string, number>();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${42}, ${job.crmId})`);

    // Replace records for every entity in the blueprint.
    for (const entity of def.entities) {
      await tx
        .delete(crmRecordsTable)
        .where(and(eq(crmRecordsTable.crmId, job.crmId), eq(crmRecordsTable.entityType, entity.name)));
    }

    const CHUNK = 500;
    if (finalRows.length > 0) {
      const values = finalRows.map((r) => {
        if (r.needsReview) needsReviewCount++;
        perEntityCounts.set(r.entityType, (perEntityCounts.get(r.entityType) ?? 0) + 1);
        const provenance: CellProvenance = {
          sourceJobId: job.sourceJobId ?? undefined,
          sourcePageId: r.provenance.sourcePageId,
          pageNumber: r.provenance.pageNumber,
          region: r.provenance.region ?? null,
          regions: r.provenance.regions,
          confidence: r.provenance.confidence ?? {},
          rawValues: r.provenance.rawValues,
        };
        return {
          crmId: job.crmId,
          entityType: r.entityType,
          data: r.data,
          provenance,
          warnings: r.warnings,
          needsReview: r.needsReview,
        };
      });
      for (let i = 0; i < values.length; i += CHUNK) {
        await tx.insert(crmRecordsTable).values(values.slice(i, i + CHUNK));
      }
    }

    await tx
      .update(crmBlueprintsTable)
      .set({ status: "committed", recordCount: finalRows.length })
      .where(eq(crmBlueprintsTable.id, job.crmId));

    await tx
      .update(rebuildJobsTable)
      .set({
        status: "committed",
        currentStage: "commit",
        rowsOut: finalRows.length,
      })
      .where(eq(rebuildJobsTable.id, jobId));

    return {
      jobId,
      crmId: job.crmId,
      recordsLoaded: finalRows.length,
      needsReview: needsReviewCount,
      duplicatesDropped: dropIds.size,
      identityLinksApplied: acceptedLinks.length,
      perEntity: Array.from(perEntityCounts, ([entityType, loaded]) => ({ entityType, loaded })),
    };
  }).then(async (result) => {
    await setStage(jobId, "commit", {
      status: "done",
      finishedAt: nowISO(),
      rowsIn: dryRun.length,
      rowsOut: result.recordsLoaded,
      message: `${result.recordsLoaded} loaded, ${result.duplicatesDropped} duplicates dropped, ${result.identityLinksApplied} link(s) applied, ${result.needsReview} flagged for review`,
    });
    // Auto-spawn a per-CRM steward bot the first time a CRM is committed.
    // Fire-and-forget: a steward failure must never fail a successful commit.
    void import("./steward")
      .then(({ spawnStewardForCrm }) => spawnStewardForCrm(result.crmId))
      .catch((err) => {
        const m = err instanceof Error ? err.message : String(err);
        console.error(`[liberator] steward spawn failed for crm ${result.crmId}: ${m}`);
      });
    return result;
  }).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    await setStage(jobId, "commit", { status: "failed", finishedAt: nowISO(), message: msg });
    await db
      .update(rebuildJobsTable)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(rebuildJobsTable.id, jobId));
    throw err;
  });
}

export async function getRebuildJob(jobId: number) {
  const [job] = await db.select().from(rebuildJobsTable).where(eq(rebuildJobsTable.id, jobId));
  return job;
}

/**
 * Single source of truth for "what will the commit produce given the
 * current accepted dedup clusters". Used by both `getLatestRebuildJobForCrm`
 * (so the UI preview always reflects the latest decisions) and by
 * `commitPipeline` (so the commit lands exactly what the preview showed).
 */
export function applyDecisionsToDryRun(
  rows: DryRunRow[],
  clusters: DedupCluster[],
): { rows: DryRunRow[]; dropIds: Set<number> } {
  const dropIds = new Set<number>();
  for (const c of clusters) {
    if (c.status !== "accepted") continue;
    for (const id of c.rowIds) {
      if (id !== c.representativeRowId) dropIds.add(id);
    }
  }
  return { rows: rows.filter((r) => !dropIds.has(r.rowId)), dropIds };
}

export async function getLatestRebuildJobForCrm(crmId: number) {
  const rows = await db
    .select()
    .from(rebuildJobsTable)
    .where(eq(rebuildJobsTable.crmId, crmId));
  if (rows.length === 0) return null;
  const job = rows.sort((a, b) => b.id - a.id)[0];
  // Decorate the response with a live "preview" view that reflects the
  // current cluster decisions, so what the user sees == what they'll get.
  const previewRows = applyDecisionsToDryRun(
    (job.dryRunRows as DryRunRow[]) ?? [],
    (job.dedupClusters as DedupCluster[]) ?? [],
  ).rows;
  return Object.assign(job, { dryRunRowsPreview: previewRows });
}

export async function updateRecipe(jobId: number, recipe: PipelineRecipe) {
  await db
    .update(rebuildJobsTable)
    .set({ recipe })
    .where(eq(rebuildJobsTable.id, jobId));
}

export async function updateClusterStatuses(jobId: number, updates: { id: string; status: "accepted" | "rejected" }[]) {
  const [job] = await db.select().from(rebuildJobsTable).where(eq(rebuildJobsTable.id, jobId));
  if (!job) return;
  const clusters = (job.dedupClusters as DedupCluster[]).map((c) => {
    const u = updates.find((x) => x.id === c.id);
    return u ? { ...c, status: u.status } : c;
  });
  await db
    .update(rebuildJobsTable)
    .set({ dedupClusters: clusters })
    .where(eq(rebuildJobsTable.id, jobId));
}

export async function updateLinkStatuses(jobId: number, updates: { id: string; status: "accepted" | "rejected" }[]) {
  const [job] = await db.select().from(rebuildJobsTable).where(eq(rebuildJobsTable.id, jobId));
  if (!job) return;
  const links = (job.identityLinks as IdentityLink[]).map((l) => {
    const u = updates.find((x) => x.id === l.id);
    return u ? { ...l, status: u.status } : l;
  });
  await db
    .update(rebuildJobsTable)
    .set({ identityLinks: links })
    .where(eq(rebuildJobsTable.id, jobId));
}
