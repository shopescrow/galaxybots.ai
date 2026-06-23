/**
 * Communication Style Adaptation
 *
 * Derives learned style assertions for each client by clustering alignment
 * signals (owner approval diffs + client session outcomes) and writing them
 * as `client_beliefs` with category="communication_style".
 *
 * Injects the top style assertions into the agentic loop at session start so
 * every future response automatically adapts its tone, formality, and detail
 * level to what has historically produced the best outcomes for that client.
 */

import { db, clientBeliefsTable, alignmentSignalsTable } from "@workspace/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let lastStyleRun = 0;

/** Style dimensions extracted from alignment signal text patterns */
const STYLE_PATTERNS: Array<{ label: string; regex: RegExp; assertion: string }> = [
  {
    label: "brief_preferred",
    regex: /too (long|verbose|detailed)|prefer (brief|short|concise)/i,
    assertion: "Prefer concise, brief responses. Avoid lengthy explanations.",
  },
  {
    label: "detailed_preferred",
    regex: /too (brief|short)|more (detail|context|explanation)/i,
    assertion: "Provide detailed, comprehensive explanations with supporting context.",
  },
  {
    label: "formal_tone",
    regex: /formal|professional|official|corporate/i,
    assertion: "Use formal, professional language. Avoid casual phrasing.",
  },
  {
    label: "casual_tone",
    regex: /casual|friendly|informal|conversational/i,
    assertion: "Use friendly, conversational language. Avoid stiff formality.",
  },
  {
    label: "bullet_points",
    regex: /bullet|list|enumerat|structured/i,
    assertion: "Structure responses with bullet points and clear numbered lists.",
  },
  {
    label: "plain_prose",
    regex: /prose|paragraph|narrative|no bullets/i,
    assertion: "Use flowing prose paragraphs rather than bullet-point lists.",
  },
  {
    label: "action_focused",
    regex: /action|next step|what to do|recommendation/i,
    assertion: "Lead with actionable recommendations before providing background context.",
  },
];

/**
 * Scans recent alignment signals for a given client and derives
 * communication style beliefs. Called by the daily scheduler.
 */
export async function runCommunicationStyleAdaptation() {
  const now = Date.now();
  if (now - lastStyleRun < ONE_DAY_MS) return;
  lastStyleRun = now;

  console.log("[style-adaptation] Running daily communication style derivation...");

  // Load recent alignment signals for all clients
  const signals = await db
    .select({
      id: alignmentSignalsTable.id,
      diffSummary: alignmentSignalsTable.diffSummary,
      originalProposal: alignmentSignalsTable.originalProposal,
      humanEdit: alignmentSignalsTable.humanEdit,
      sourceStakeholder: alignmentSignalsTable.sourceStakeholder,
    })
    .from(alignmentSignalsTable)
    .where(
      and(
        sql`${alignmentSignalsTable.createdAt} > NOW() - INTERVAL '30 days'`,
        isNull(alignmentSignalsTable.clusterId),
      ),
    )
    .orderBy(desc(alignmentSignalsTable.createdAt))
    .limit(1000);

  // Group by implied client from originalProposal.clientId
  const clientSignals = new Map<number, typeof signals>();
  for (const s of signals) {
    const clientId = (s.originalProposal as Record<string, unknown>)?.clientId;
    if (typeof clientId !== "number") continue;
    if (!clientSignals.has(clientId)) clientSignals.set(clientId, []);
    clientSignals.get(clientId)!.push(s);
  }

  let totalBeliefs = 0;

  for (const [clientId, sigs] of clientSignals.entries()) {
    const allText = sigs.map((s) => s.diffSummary ?? "").join(" ");

    const matchedPatterns: typeof STYLE_PATTERNS = [];
    for (const pattern of STYLE_PATTERNS) {
      if (pattern.regex.test(allText)) {
        matchedPatterns.push(pattern);
      }
    }

    if (matchedPatterns.length === 0) continue;

    // Merge opposing patterns (e.g., brief + detailed → take dominant by occurrence count)
    const deduped = deduplicateOpposingPatterns(matchedPatterns, allText);

    // Use a generic system botId (1) or skip if no authorBotId available
    const authorBotId = 1;

    for (const pattern of deduped) {
      try {
        // Upsert: if a belief with this label already exists, update confidence
        const existing = await db
          .select({ id: clientBeliefsTable.id, confidence: clientBeliefsTable.confidence })
          .from(clientBeliefsTable)
          .where(
            and(
              eq(clientBeliefsTable.clientId, clientId),
              eq(clientBeliefsTable.category, "communication_style"),
              sql`${clientBeliefsTable.beliefText} = ${pattern.assertion}`,
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          const newConf = Math.min(1.0, (existing[0].confidence ?? 0.5) + 0.05);
          await db
            .update(clientBeliefsTable)
            .set({ confidence: newConf, updatedAt: new Date() })
            .where(eq(clientBeliefsTable.id, existing[0].id));
        } else {
          await db.insert(clientBeliefsTable).values({
            clientId,
            authorBotId,
            beliefText: pattern.assertion,
            confidence: 0.6,
            category: "communication_style",
            conflictResolutionStatus: "none",
          });
          totalBeliefs++;
        }
      } catch {
        // Skip individual insert errors
      }
    }
  }

  console.log(`[style-adaptation] Derived ${totalBeliefs} new communication style beliefs.`);
}

/** Remove opposing patterns by keeping the one with more signal occurrences */
function deduplicateOpposingPatterns(
  patterns: typeof STYLE_PATTERNS,
  text: string,
): typeof STYLE_PATTERNS {
  const opposing = [
    ["brief_preferred", "detailed_preferred"],
    ["formal_tone", "casual_tone"],
    ["bullet_points", "plain_prose"],
  ];

  const labels = new Set(patterns.map((p) => p.label));
  const toRemove = new Set<string>();

  for (const [a, b] of opposing) {
    if (labels.has(a) && labels.has(b)) {
      // Remove the one with fewer occurrences
      const countA = (text.match(STYLE_PATTERNS.find((p) => p.label === a)!.regex) ?? []).length;
      const countB = (text.match(STYLE_PATTERNS.find((p) => p.label === b)!.regex) ?? []).length;
      toRemove.add(countA >= countB ? b : a);
    }
  }

  return patterns.filter((p) => !toRemove.has(p.label));
}

/**
 * Returns top-3 active communication style beliefs for a client.
 * Called by the agentic loop engine at session start.
 */
export async function getClientStyleBeliefs(clientId: number): Promise<string[]> {
  try {
    const beliefs = await db
      .select({ beliefText: clientBeliefsTable.beliefText })
      .from(clientBeliefsTable)
      .where(
        and(
          eq(clientBeliefsTable.clientId, clientId),
          eq(clientBeliefsTable.category, "communication_style"),
          isNull(clientBeliefsTable.archivedAt),
        ),
      )
      .orderBy(desc(clientBeliefsTable.confidence))
      .limit(3);

    return beliefs.map((b) => b.beliefText);
  } catch {
    return [];
  }
}
