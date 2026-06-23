import { db, botBeliefsTable, episodicSummariesTable, clientBeliefsTable } from "@workspace/db";
import { eq, and, isNull, desc, isNotNull } from "drizzle-orm";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BeliefContextEntry {
  text: string;
  confidence: number;
  confidencePct: number;
  daysAgo: number;
  category: string;
  isShared: boolean;
}

/**
 * Retrieve top beliefs for a bot/client, ranked by relevance × confidence.
 * Returns formatted context strings for injection into the system prompt.
 */
export async function getBotBeliefContext(
  botId: number,
  clientId: number,
  limit = 15,
): Promise<string> {
  const now = Date.now();

  const [beliefs, sharedBeliefs, episodicSummary] = await Promise.all([
    db
      .select()
      .from(botBeliefsTable)
      .where(
        and(
          eq(botBeliefsTable.botId, botId),
          eq(botBeliefsTable.clientId, clientId),
          isNull(botBeliefsTable.archivedAt),
        ),
      )
      .orderBy(desc(botBeliefsTable.confidence))
      .limit(limit),

    db
      .select()
      .from(clientBeliefsTable)
      .where(
        and(
          eq(clientBeliefsTable.clientId, clientId),
          isNull(clientBeliefsTable.archivedAt),
        ),
      )
      .orderBy(desc(clientBeliefsTable.confidence))
      .limit(5),

    db
      .select({
        narrative: episodicSummariesTable.narrative,
        anchorEvents: episodicSummariesTable.anchorEvents,
        periodStart: episodicSummariesTable.periodStart,
        periodEnd: episodicSummariesTable.periodEnd,
      })
      .from(episodicSummariesTable)
      .where(
        and(
          eq(episodicSummariesTable.botId, botId),
          eq(episodicSummariesTable.clientId, clientId),
        ),
      )
      .orderBy(desc(episodicSummariesTable.periodEnd))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (beliefs.length === 0 && sharedBeliefs.length === 0 && !episodicSummary) {
    return "";
  }

  const parts: string[] = ["[Belief Context]"];

  if (beliefs.length > 0) {
    parts.push("My current beliefs:");
    for (const b of beliefs) {
      const daysAgo = Math.round((now - b.lastConfirmedAt.getTime()) / MS_PER_DAY);
      const confPct = Math.round(Number(b.confidence) * 100);
      const staleness = daysAgo > 0 ? `, ${daysAgo} day${daysAgo !== 1 ? "s" : ""} ago` : "";
      parts.push(`- ${b.beliefText} (confidence: ${confPct}%${staleness}, category: ${b.category})`);
    }
  }

  if (sharedBeliefs.length > 0) {
    parts.push("Shared client knowledge:");
    for (const b of sharedBeliefs) {
      const confPct = Math.round(Number(b.confidence) * 100);
      parts.push(`- ${b.beliefText} (confidence: ${confPct}%, category: ${b.category})`);
    }
  }

  if (episodicSummary) {
    parts.push(`\nEpisodic Memory (${episodicSummary.periodStart.toISOString().slice(0, 7)}):`);
    parts.push(episodicSummary.narrative.slice(0, 800));

    const anchors = (episodicSummary.anchorEvents ?? []) as Array<{
      event: string;
      significance: string;
      permanent: boolean;
    }>;
    const permanentAnchors = anchors.filter((a) => a.permanent);
    if (permanentAnchors.length > 0) {
      parts.push("Permanent anchor events:");
      for (const anchor of permanentAnchors.slice(0, 3)) {
        parts.push(`- ${anchor.event}: ${anchor.significance}`);
      }
    }
  }

  return parts.join("\n");
}
