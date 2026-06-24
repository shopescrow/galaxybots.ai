import { db, botBeliefsTable, beliefDomainMapTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, inArray, desc, asc } from "drizzle-orm";
import type { TaskCategory, CoordinatorRole } from "@workspace/db";
import { getDomainConfidence } from "./belief-confidence-resolver";

const DEFAULT_BELIEF_DOMAIN_MAP: Record<TaskCategory, string[]> = {
  financial: ["market_conditions", "client_facts", "operational"],
  legal: ["operational", "client_facts", "relationship_dynamics"],
  research: ["market_conditions", "competitor_intel", "product_knowledge"],
  analysis: ["market_conditions", "competitor_intel", "operational"],
  execution: ["operational", "product_knowledge"],
  review: ["operational", "client_facts", "product_knowledge"],
};

const OPERATIONAL_CATEGORIES = ["operational", "product_knowledge"];
const TOP_K = 5;

export interface BeliefBriefing {
  role: CoordinatorRole;
  briefingText: string;
  beliefCount: number;
}

async function getDomainCategoriesForTask(taskCategory: TaskCategory): Promise<string[]> {
  try {
    const rows = await db
      .select()
      .from(beliefDomainMapTable)
      .where(eq(beliefDomainMapTable.taskCategory, taskCategory))
      .limit(1);
    if (rows.length > 0 && rows[0].beliefDomains.length > 0) {
      return rows[0].beliefDomains;
    }
  } catch {
  }
  return DEFAULT_BELIEF_DOMAIN_MAP[taskCategory] ?? [];
}

export async function distillBeliefBriefing(
  botId: number,
  role: CoordinatorRole,
  taskCategory: TaskCategory,
  clientId?: number,
): Promise<BeliefBriefing> {
  const domains = await getDomainCategoriesForTask(taskCategory);

  const baseConditions = [
    eq(botBeliefsTable.botId, botId),
    isNull(botBeliefsTable.archivedAt),
    isNull(botBeliefsTable.contradictedById),
  ];

  if (clientId !== undefined) {
    baseConditions.push(eq(botBeliefsTable.clientId, clientId));
  }

  if (domains.length > 0) {
    baseConditions.push(inArray(botBeliefsTable.category, domains));
  }

  try {
    let beliefs: { id: number; beliefText: string; confidence: number; category: string }[] = [];

    if (role === "thinker") {
      beliefs = await db
        .select({
          id: botBeliefsTable.id,
          beliefText: botBeliefsTable.beliefText,
          confidence: botBeliefsTable.confidence,
          category: botBeliefsTable.category,
        })
        .from(botBeliefsTable)
        .where(and(...baseConditions))
        .orderBy(desc(botBeliefsTable.confidence))
        .limit(TOP_K);
    } else if (role === "worker") {
      const workerConditions = [...baseConditions];
      if (OPERATIONAL_CATEGORIES.length > 0) {
        workerConditions.push(inArray(botBeliefsTable.category, OPERATIONAL_CATEGORIES));
      }
      beliefs = await db
        .select({
          id: botBeliefsTable.id,
          beliefText: botBeliefsTable.beliefText,
          confidence: botBeliefsTable.confidence,
          category: botBeliefsTable.category,
        })
        .from(botBeliefsTable)
        .where(and(...workerConditions))
        .orderBy(desc(botBeliefsTable.confidence))
        .limit(TOP_K);

      if (beliefs.length === 0) {
        beliefs = await db
          .select({
            id: botBeliefsTable.id,
            beliefText: botBeliefsTable.beliefText,
            confidence: botBeliefsTable.confidence,
            category: botBeliefsTable.category,
          })
          .from(botBeliefsTable)
          .where(and(...baseConditions))
          .orderBy(desc(botBeliefsTable.confidence))
          .limit(TOP_K);
      }
    } else {
      beliefs = await db
        .select({
          id: botBeliefsTable.id,
          beliefText: botBeliefsTable.beliefText,
          confidence: botBeliefsTable.confidence,
          category: botBeliefsTable.category,
        })
        .from(botBeliefsTable)
        .where(and(...baseConditions))
        .orderBy(asc(botBeliefsTable.confidence))
        .limit(TOP_K);
    }

    if (beliefs.length === 0) {
      return { role, briefingText: "", beliefCount: 0 };
    }

    let briefingText = "";

    if (role === "thinker") {
      const lines = beliefs.map(
        (b) =>
          `• I am highly confident that (${Math.round(b.confidence * 100)}%): ${b.beliefText}`,
      );
      briefingText = `[BELIEF BRIEFING — THINKER]\nYour highest-confidence beliefs relevant to this task:\n${lines.join("\n")}`;
    } else if (role === "worker") {
      const lines = beliefs.map(
        (b) =>
          `• Operationally: ${b.beliefText} [confidence: ${Math.round(b.confidence * 100)}%]`,
      );
      briefingText = `[BELIEF BRIEFING — WORKER]\nYour most operationally relevant beliefs for execution:\n${lines.join("\n")}`;
    } else {
      const lines = beliefs.map(
        (b) =>
          `• I am uncertain about (${Math.round(b.confidence * 100)}% confidence): ${b.beliefText} — actively scrutinize this area.`,
      );
      briefingText = `[BELIEF BRIEFING — VERIFIER]\nYour lowest-confidence beliefs — use these as focal points for critical review:\n${lines.join("\n")}`;
    }

    return { role, briefingText, beliefCount: beliefs.length };
  } catch (err) {
    console.error("[BeliefDistiller] Failed to distill belief briefing:", err);
    return { role, briefingText: "", beliefCount: 0 };
  }
}
