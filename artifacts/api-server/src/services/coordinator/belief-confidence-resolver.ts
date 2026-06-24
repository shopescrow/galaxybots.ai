import { db, botBeliefsTable, beliefDomainMapTable } from "@workspace/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import type { TaskCategory } from "@workspace/db";

const DEFAULT_BELIEF_DOMAIN_MAP: Record<TaskCategory, string[]> = {
  financial: ["market_conditions", "client_facts", "operational"],
  legal: ["operational", "client_facts", "relationship_dynamics"],
  research: ["market_conditions", "competitor_intel", "product_knowledge"],
  analysis: ["market_conditions", "competitor_intel", "operational"],
  execution: ["operational", "product_knowledge"],
  review: ["operational", "client_facts", "product_knowledge"],
};

const DEFAULT_CONFIDENCE = 0.5;

export interface BeliefConfidenceResult {
  averageConfidence: number;
  hasActiveContradiction: boolean;
  contradictionRef: string | null;
  beliefCount: number;
  domains: string[];
}

let domainMapCache: Map<TaskCategory, string[]> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getDomainTags(taskCategory: TaskCategory): Promise<string[]> {
  const now = Date.now();
  if (domainMapCache && now < cacheExpiry) {
    return domainMapCache.get(taskCategory) ?? DEFAULT_BELIEF_DOMAIN_MAP[taskCategory] ?? [];
  }

  try {
    const rows = await db.select().from(beliefDomainMapTable);
    const freshMap = new Map<TaskCategory, string[]>();
    for (const row of rows) {
      freshMap.set(row.taskCategory as TaskCategory, row.beliefDomains);
    }
    domainMapCache = freshMap;
    cacheExpiry = now + CACHE_TTL_MS;
  } catch {
    domainMapCache = new Map(
      Object.entries(DEFAULT_BELIEF_DOMAIN_MAP) as [TaskCategory, string[]][]
    );
    cacheExpiry = now + CACHE_TTL_MS;
  }

  return domainMapCache.get(taskCategory) ?? DEFAULT_BELIEF_DOMAIN_MAP[taskCategory] ?? [];
}

export async function getDomainConfidence(
  botId: number,
  taskCategory: TaskCategory,
  clientId?: number,
): Promise<BeliefConfidenceResult> {
  const domains = await getDomainTags(taskCategory);

  if (domains.length === 0) {
    return {
      averageConfidence: DEFAULT_CONFIDENCE,
      hasActiveContradiction: false,
      contradictionRef: null,
      beliefCount: 0,
      domains,
    };
  }

  try {
    const conditions = [
      eq(botBeliefsTable.botId, botId),
      isNull(botBeliefsTable.archivedAt),
      inArray(botBeliefsTable.category, domains),
    ];

    if (clientId !== undefined) {
      conditions.push(eq(botBeliefsTable.clientId, clientId));
    }

    const beliefs = await db
      .select({
        id: botBeliefsTable.id,
        confidence: botBeliefsTable.confidence,
        contradictedById: botBeliefsTable.contradictedById,
      })
      .from(botBeliefsTable)
      .where(and(...conditions));

    if (beliefs.length === 0) {
      return {
        averageConfidence: DEFAULT_CONFIDENCE,
        hasActiveContradiction: false,
        contradictionRef: null,
        beliefCount: 0,
        domains,
      };
    }

    const contradicted = beliefs.find((b) => b.contradictedById !== null);
    const hasActiveContradiction = contradicted !== undefined;

    const nonContradictedBeliefs = beliefs.filter((b) => b.contradictedById === null);
    const total = nonContradictedBeliefs.reduce((sum, b) => sum + b.confidence, 0);
    const averageConfidence =
      nonContradictedBeliefs.length > 0
        ? total / nonContradictedBeliefs.length
        : DEFAULT_CONFIDENCE;

    return {
      averageConfidence,
      hasActiveContradiction,
      contradictionRef: contradicted
        ? `belief:${contradicted.id}↔${contradicted.contradictedById}`
        : null,
      beliefCount: beliefs.length,
      domains,
    };
  } catch (err) {
    console.error("[BeliefConfidenceResolver] Failed to query beliefs:", err);
    return {
      averageConfidence: DEFAULT_CONFIDENCE,
      hasActiveContradiction: false,
      contradictionRef: null,
      beliefCount: 0,
      domains,
    };
  }
}

export function invalidateDomainMapCache(): void {
  domainMapCache = null;
  cacheExpiry = 0;
}
