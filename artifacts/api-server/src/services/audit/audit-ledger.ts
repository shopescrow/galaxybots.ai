import { createHash } from "crypto";
import { db, galaxyAuditLedgerTable } from "@workspace/db";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import type { AuditEngine, AuditDecisionType, InsertGalaxyAuditLedger } from "@workspace/db";

/** In-process counter for audit write failures — observable via getAuditHealth(). */
let auditWriteFailureCount = 0;
let auditWriteSuccessCount = 0;

export function getAuditHealth(): { failures: number; successes: number; failureRate: number } {
  const total = auditWriteSuccessCount + auditWriteFailureCount;
  return {
    failures: auditWriteFailureCount,
    successes: auditWriteSuccessCount,
    failureRate: total === 0 ? 0 : Math.round((auditWriteFailureCount / total) * 10000) / 100,
  };
}

export interface AuditEntryInput {
  clientId?: number | null;
  sessionId?: string | null;
  pipelineRunId?: string | null;
  engine: AuditEngine;
  decisionType: AuditDecisionType;
  payload: Record<string, unknown>;
  outcomeQualityScore?: number | null;
}

function sortedStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(sortedStringify).join(",") + "]";
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort();
  const pairs = sorted.map((k) => JSON.stringify(k) + ":" + sortedStringify((value as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

function hashPayload(payload: Record<string, unknown>): string {
  const canonical = sortedStringify(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

export async function writeAuditEntry(entry: AuditEntryInput): Promise<string> {
  try {
    const payloadHash = hashPayload(entry.payload);
    const values: InsertGalaxyAuditLedger = {
      clientId: entry.clientId ?? null,
      sessionId: entry.sessionId ?? null,
      pipelineRunId: entry.pipelineRunId ?? null,
      engine: entry.engine,
      decisionType: entry.decisionType,
      payload: entry.payload,
      payloadHash,
      outcomeQualityScore: entry.outcomeQualityScore ?? null,
    };

    const [row] = await db.insert(galaxyAuditLedgerTable).values(values).returning({ id: galaxyAuditLedgerTable.id });
    auditWriteSuccessCount++;
    return row?.id ?? "";
  } catch (err) {
    auditWriteFailureCount++;
    // Structured error: include enough context to identify the gap in the ledger.
    console.error(
      `[AuditLedger] WRITE FAILURE (total failures: ${auditWriteFailureCount}) — engine=${entry.engine} decisionType=${entry.decisionType} clientId=${entry.clientId ?? "none"} sessionId=${entry.sessionId ?? "none"}`,
      err,
    );
    return "";
  }
}

export interface AuditLedgerFilters {
  clientId?: number;
  engine?: AuditEngine;
  decisionType?: AuditDecisionType;
  sessionId?: string;
  after?: Date;
  before?: Date;
  limit?: number;
  offset?: number;
}

export async function getAuditEntries(filters: AuditLedgerFilters = {}) {
  try {
    const conditions = [];
    if (filters.clientId != null) conditions.push(eq(galaxyAuditLedgerTable.clientId, filters.clientId));
    if (filters.engine) conditions.push(eq(galaxyAuditLedgerTable.engine, filters.engine));
    if (filters.decisionType) conditions.push(eq(galaxyAuditLedgerTable.decisionType, filters.decisionType));
    if (filters.sessionId) conditions.push(eq(galaxyAuditLedgerTable.sessionId, filters.sessionId));
    if (filters.after) conditions.push(gte(galaxyAuditLedgerTable.createdAt, filters.after));
    if (filters.before) conditions.push(lte(galaxyAuditLedgerTable.createdAt, filters.before));

    const limit = Math.min(filters.limit ?? 100, 1000);
    const offset = filters.offset ?? 0;

    const query = db
      .select()
      .from(galaxyAuditLedgerTable)
      .orderBy(desc(galaxyAuditLedgerTable.createdAt))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  } catch (err) {
    console.error("[AuditLedger] getAuditEntries failed:", err);
    return [];
  }
}
