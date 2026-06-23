import { db, clientBotsTable, episodicSummariesTable, conversations, messages } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { GLM52Adapter } from "../../../agent-core/adapters/glm52-adapter.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface EpisodicNarrative {
  narrative: string;
  turning_points: string[];
  decisions: string[];
  outcomes: string[];
  forward_implications: string[];
  anchor_events: Array<{
    timestamp: string;
    event: string;
    significance: string;
    permanent: boolean;
  }>;
}

async function buildEpisodicNarrative(
  botId: number,
  clientId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<EpisodicNarrative | null> {
  const convRows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.botId, botId),
        gte(conversations.createdAt, periodStart),
        lte(conversations.createdAt, periodEnd),
      ),
    )
    .limit(500);

  if (convRows.length === 0) return null;

  const allMessages: { role: string; content: unknown; createdAt: Date }[] = [];
  for (const conv of convRows.slice(0, 20)) {
    const msgs = await db
      .select({ role: messages.role, content: messages.content, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .limit(100);
    allMessages.push(...msgs);
  }

  if (allMessages.length === 0) return null;

  allMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const sessionLog = allMessages
    .map((m) => `[${m.createdAt.toISOString()}] ${m.role.toUpperCase()}: ${String(m.content ?? "").slice(0, 500)}`)
    .join("\n");

  const systemPrompt = `You are an episodic memory synthesizer for an AI assistant. Analyze the month's session logs and produce a structured episodic narrative.

Return ONLY valid JSON:
{
  "narrative": "<3-5 paragraph narrative arc>",
  "turning_points": ["<event>"],
  "decisions": ["<decision>"],
  "outcomes": ["<outcome>"],
  "forward_implications": ["<implication>"],
  "anchor_events": [
    { "timestamp": "<ISO>", "event": "<what>", "significance": "<why>", "permanent": <bool> }
  ]
}`;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: `Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}\nBot: ${botId} / Client: ${clientId}\n\n${sessionLog.slice(0, 900_000)}`,
    },
  ];

  const glm = new GLM52Adapter(process.env.GLM_API_KEY ?? "");
  if (!glm.isAvailable()) {
    console.warn("[episodic-memory] GLM API key not configured");
    return null;
  }

  try {
    const result = await glm.complete({ model: "glm-5.2-long", messages, maxTokens: 2000 });

    let parsed: EpisodicNarrative | null = null;
    try {
      parsed = JSON.parse(result.content) as EpisodicNarrative;
    } catch {
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) { try { parsed = JSON.parse(match[0]) as EpisodicNarrative; } catch { return null; } }
    }
    return parsed;
  } catch (err) {
    console.error("[episodic-memory] GLM call failed:", errMsg(err));
    return null;
  }
}

export async function runEpisodicMemoryForBot(
  botId: number,
  clientId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  const narrative = await buildEpisodicNarrative(botId, clientId, periodStart, periodEnd);
  if (!narrative) return;

  await db.insert(episodicSummariesTable).values({
    botId,
    clientId,
    periodStart,
    periodEnd,
    narrative: narrative.narrative,
    anchorEvents: narrative.anchor_events,
    turningPoints: narrative.turning_points,
    decisions: narrative.decisions,
    outcomes: narrative.outcomes,
    forwardImplications: narrative.forward_implications,
    modelUsed: "glm-5.2-long",
  });

  console.log(`[episodic-memory] Created episodic summary for bot ${botId} (${periodStart.toISOString()} – ${periodEnd.toISOString()})`);
}

export async function checkEpisodicMemory(): Promise<void> {
  const now = new Date();
  if (now.getUTCDate() !== 1) return;

  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  try {
    const assignments = await db
      .select({ botId: clientBotsTable.botId, clientId: clientBotsTable.clientId })
      .from(clientBotsTable)
      .where(eq(clientBotsTable.status, "active"));

    for (const assignment of assignments) {
      try {
        await runEpisodicMemoryForBot(assignment.botId, assignment.clientId, periodStart, periodEnd);
      } catch (err) {
        console.error(`[episodic-memory] bot ${assignment.botId} error:`, errMsg(err));
      }
    }
  } catch (err) {
    console.error("[episodic-memory] top-level error:", errMsg(err));
  }
}
