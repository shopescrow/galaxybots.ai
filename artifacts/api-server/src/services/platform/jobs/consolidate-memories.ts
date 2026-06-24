import { db, botMemoriesTable, botBeliefsTable, clientBotsTable } from "@workspace/db";
import { eq, isNull, gte, and, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { CATEGORY_HALF_LIFE_DAYS as BELIEF_HALF_LIFE_DAYS, type BeliefCategory } from "../../../agent-core/value-objects/index.js";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const RECENT_DAYS = 7;
const SIMILARITY_THRESHOLD = 0.82;

interface MemoryCluster {
  representativeMemory: { id: number; content: string; summary: string; topic: string | null };
  members: Array<{ id: number; content: string; summary: string }>;
}

interface SynthesisResult {
  beliefText: string;
  confidence: number;
  category: BeliefCategory;
  isContradiction: boolean;
}

async function clusterMemoriesForBot(
  botId: number,
  clientId: number,
  since: Date,
): Promise<MemoryCluster[]> {
  const memories = await db
    .select({
      id: botMemoriesTable.id,
      content: botMemoriesTable.content,
      summary: botMemoriesTable.summary,
      topic: botMemoriesTable.topic,
      embedding: botMemoriesTable.embedding,
    })
    .from(botMemoriesTable)
    .where(
      and(
        eq(botMemoriesTable.botId, botId),
        eq(botMemoriesTable.clientId, clientId),
        isNull(botMemoriesTable.archivedAt),
        gte(botMemoriesTable.createdAt, since),
      ),
    )
    .limit(200);

  if (memories.length === 0) return [];

  const clusters: MemoryCluster[] = [];
  const assigned = new Set<number>();

  for (const mem of memories) {
    if (assigned.has(mem.id)) continue;
    if (!mem.embedding) {
      clusters.push({
        representativeMemory: { id: mem.id, content: mem.content, summary: mem.summary, topic: mem.topic },
        members: [],
      });
      assigned.add(mem.id);
      continue;
    }

    const cluster: MemoryCluster = {
      representativeMemory: { id: mem.id, content: mem.content, summary: mem.summary, topic: mem.topic },
      members: [],
    };

    for (const other of memories) {
      if (other.id === mem.id || assigned.has(other.id)) continue;
      if (!other.embedding) continue;

      const a = mem.embedding as number[];
      const b = other.embedding as number[];
      const dot = a.reduce((acc, v, i) => acc + v * (b[i] ?? 0), 0);
      const normA = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
      const normB = Math.sqrt(b.reduce((acc, v) => acc + v * v, 0));
      const similarity = normA > 0 && normB > 0 ? dot / (normA * normB) : 0;

      if (similarity >= SIMILARITY_THRESHOLD) {
        cluster.members.push({ id: other.id, content: other.content, summary: other.summary });
        assigned.add(other.id);
      }
    }

    assigned.add(mem.id);
    clusters.push(cluster);
  }

  return clusters;
}

async function synthesizeBelief(cluster: MemoryCluster): Promise<SynthesisResult | null> {
  const allContent = [
    cluster.representativeMemory.content,
    ...cluster.members.map((m) => m.content),
  ].slice(0, 10);

  if (allContent.length === 0) return null;

  const prompt = `You are an AI knowledge synthesizer. Given memory entries from an AI assistant, synthesize them into a single structured belief.

MEMORIES:
${allContent.map((c, i) => `${i + 1}. ${c.slice(0, 400)}`).join("\n")}

Return a JSON object:
{
  "beliefText": "<one clear declarative sentence>",
  "confidence": <float 0.0-1.0>,
  "category": "<one of: market_conditions, client_facts, competitor_intel, product_knowledge, relationship_dynamics, operational>",
  "isContradiction": <true if memories conflict>
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are a strict JSON-only responder." },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]) as Record<string, unknown>; } catch { return null; }
      } else { return null; }
    }

    const beliefText = typeof parsed.beliefText === "string" ? parsed.beliefText : null;
    if (!beliefText) return null;

    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5)));
    const rawCategory = typeof parsed.category === "string" ? parsed.category : "operational";
    const validCategories: BeliefCategory[] = [
      "market_conditions", "client_facts", "competitor_intel",
      "product_knowledge", "relationship_dynamics", "operational",
    ];
    const category: BeliefCategory = validCategories.includes(rawCategory as BeliefCategory)
      ? (rawCategory as BeliefCategory)
      : "operational";

    return { beliefText, confidence, category, isContradiction: parsed.isContradiction === true };
  } catch (err) {
    console.error("[consolidate-memories] synthesizeBelief error:", errMsg(err));
    return null;
  }
}

export async function consolidateMemoriesForBot(botId: number, clientId: number): Promise<void> {
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const clusters = await clusterMemoriesForBot(botId, clientId, since);
  if (clusters.length === 0) return;

  for (const cluster of clusters) {
    const synthesis = await synthesizeBelief(cluster);
    if (!synthesis) continue;

    const halfLife = BELIEF_HALF_LIFE_DAYS[synthesis.category] ?? 30;

    const [newBelief] = await db
      .insert(botBeliefsTable)
      .values({
        botId,
        clientId,
        beliefText: synthesis.beliefText,
        confidence: synthesis.confidence,
        evidenceCount: cluster.members.length + 1,
        lastConfirmedAt: new Date(),
        category: synthesis.category,
        halfLifeDays: halfLife,
        immutable: false,
      })
      .onConflictDoNothing()
      .returning({ id: botBeliefsTable.id });

    const beliefId = newBelief?.id;
    const allMemoryIds = [cluster.representativeMemory.id, ...cluster.members.map((m) => m.id)];

    for (const memId of allMemoryIds) {
      await db
        .update(botMemoriesTable)
        .set({ archivedAt: new Date(), supersededByBeliefId: beliefId ?? null })
        .where(eq(botMemoriesTable.id, memId));
    }
  }

  console.log(`[consolidate-memories] bot ${botId}/client ${clientId}: processed ${clusters.length} clusters`);
}

export async function checkMemoryConsolidation(): Promise<void> {
  try {
    const assignments = await db
      .select({ botId: clientBotsTable.botId, clientId: clientBotsTable.clientId })
      .from(clientBotsTable)
      .where(eq(clientBotsTable.status, "active"));

    for (const assignment of assignments) {
      try {
        await consolidateMemoriesForBot(assignment.botId, assignment.clientId);
      } catch (err) {
        console.error(`[consolidate-memories] bot ${assignment.botId} error:`, errMsg(err));
      }
    }
  } catch (err) {
    console.error("[consolidate-memories] top-level error:", errMsg(err));
  }
}
