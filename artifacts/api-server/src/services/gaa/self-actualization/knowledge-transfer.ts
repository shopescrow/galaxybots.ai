import {
  db,
  knowledgeTransfersTable,
  gaaMemoryTable,
  botsTable,
  type GaaMemory,
  type BotCapabilityModel,
} from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { callWithFallback } from "../../ai-safety/model-fallback";
import { remember } from "../memory-tiers";
import {
  getStrongestCapabilities,
  getWeakestCategories,
  getCapabilitySignal,
} from "./capability-model";
import { isKillSwitchActive } from "./config";

// ---------------------------------------------------------------------------
// Cross-agent knowledge distillation. High-confidence, durable (cold-tier)
// lessons learned by strong agents are distilled into compact beliefs and
// transferred to weaker agents in the same task category — accelerating the
// whole fleet rather than relearning per-agent. Conflicts (an incoming belief
// contradicting one the target already holds) are resolved by confidence:
// the higher-confidence belief wins; ties keep the incumbent.
// ---------------------------------------------------------------------------

const COLD_CONFIDENCE_FLOOR = 80;

export interface TransferOutcome {
  transferId: number;
  sourceBotId: number | null;
  targetBotId: number;
  taskCategory: string | null;
  status: "applied" | "rejected" | "conflict";
}

function categoryFromMemory(mem: GaaMemory): string | null {
  // Keys are namespaced like "reflection:botN:type" or "practice:botN:cat".
  const parts = mem.key.split(":");
  if (parts[0] === "practice" && parts[2]) return parts[2];
  return null;
}

async function distillBelief(lesson: string, taskCategory: string): Promise<string> {
  try {
    const result = await callWithFallback({
      model: "gpt-5-mini",
      temperature: 0.2,
      maxCompletionTokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Distil the following lesson into ONE compact, actionable belief (max 30 words) that another " +
            `agent working on "${taskCategory}" tasks can apply directly. Respond with the belief text only.`,
        },
        { role: "user", content: lesson },
      ],
    });
    const text = result.completion.choices[0]?.message?.content?.trim();
    return text && text.length > 0 ? text.slice(0, 400) : lesson.slice(0, 400);
  } catch {
    return lesson.slice(0, 400);
  }
}

async function transferToTarget(params: {
  sourceBotId: number | null;
  target: BotCapabilityModel;
  lesson: string;
  distilledBelief: string;
  memoryId: number | null;
  confidence: number;
}): Promise<TransferOutcome> {
  const { target, distilledBelief, confidence } = params;

  // Conflict resolution: does the target already hold an applied belief for this
  // category? If it materially differs, the higher-confidence belief wins.
  const [incumbent] = await db
    .select()
    .from(knowledgeTransfersTable)
    .where(
      and(
        eq(knowledgeTransfersTable.targetBotId, target.botId),
        eq(knowledgeTransfersTable.status, "applied"),
        target.taskCategory
          ? eq(knowledgeTransfersTable.taskCategory, target.taskCategory)
          : sql`${knowledgeTransfersTable.taskCategory} IS NULL`,
      ),
    )
    .orderBy(desc(knowledgeTransfersTable.confidence))
    .limit(1);

  let status: "applied" | "conflict" = "applied";
  let conflictResolution: string | null = null;

  if (
    incumbent &&
    incumbent.distilledBelief.trim() !== distilledBelief.trim()
  ) {
    if (incumbent.confidence >= confidence) {
      status = "conflict";
      conflictResolution = `Kept incumbent belief (conf ${incumbent.confidence.toFixed(2)} ≥ incoming ${confidence.toFixed(2)})`;
    } else {
      conflictResolution = `Superseded incumbent #${incumbent.id} (incoming conf ${confidence.toFixed(2)} > ${incumbent.confidence.toFixed(2)})`;
    }
  }

  const [row] = await db
    .insert(knowledgeTransfersTable)
    .values({
      sourceBotId: params.sourceBotId,
      targetBotId: target.botId,
      clientId: target.clientId ?? null,
      taskCategory: target.taskCategory,
      memoryId: params.memoryId,
      lessonText: params.lesson,
      distilledBelief,
      transferType: "belief",
      confidence,
      status,
      conflictResolution,
    })
    .returning();

  // When applied, inject the distilled belief into the target's memory scope.
  if (status === "applied") {
    try {
      await remember({
        key: `transfer:bot${target.botId}:${target.taskCategory}`,
        content: `Distilled from ${params.sourceBotId ? `bot ${params.sourceBotId}` : "fleet"}: ${params.lesson}`,
        lesson: distilledBelief,
        scope: target.clientId ? "client" : "platform",
        clientId: target.clientId ?? null,
        confidence: Math.round(confidence * 100),
      });
    } catch (err) {
      console.warn("[self-actualization] transfer memory write failed:", err);
    }
  }

  return {
    transferId: row.id,
    sourceBotId: params.sourceBotId,
    targetBotId: target.botId,
    taskCategory: target.taskCategory,
    status,
  };
}

/**
 * Run one knowledge distillation pass: pull durable high-confidence lessons,
 * distil them, and transfer to weaker agents in the same category.
 */
export async function runKnowledgeDistillation(opts: {
  maxTransfers?: number;
} = {}): Promise<TransferOutcome[]> {
  if (await isKillSwitchActive()) {
    console.log("[self-actualization] kill switch active — skipping knowledge distillation");
    return [];
  }
  const maxTransfers = opts.maxTransfers ?? 8;

  // Durable, high-confidence lessons are the distillation source.
  const coldLessons = await db
    .select()
    .from(gaaMemoryTable)
    .where(
      and(
        eq(gaaMemoryTable.tier, "cold"),
        gte(gaaMemoryTable.confidence, COLD_CONFIDENCE_FLOOR),
      ),
    )
    .orderBy(desc(gaaMemoryTable.confidence))
    .limit(20);

  if (coldLessons.length === 0) return [];

  const outcomes: TransferOutcome[] = [];
  const allBots = await db.select({ id: botsTable.id }).from(botsTable);

  for (const lesson of coldLessons) {
    if (outcomes.length >= maxTransfers) break;
    const category = categoryFromMemory(lesson);
    if (!category) continue;

    // Identify a strong donor for this category (may be none → fleet-sourced).
    const donors = await getStrongestCapabilities({
      taskCategory: category,
      limit: 1,
    });
    const donor = donors[0] ?? null;

    // Find weak recipients in this category.
    const recipients: BotCapabilityModel[] = [];
    for (const bot of allBots) {
      if (donor && bot.id === donor.botId) continue;
      const weak = await getWeakestCategories(bot.id, { limit: 5 });
      const match = weak.find((w) => w.taskCategory === category);
      if (match) recipients.push(match);
      if (recipients.length >= 2) break;
    }
    if (recipients.length === 0) continue;

    const distilledBelief = await distillBelief(lesson.lesson ?? lesson.content, category);
    const confidence = donor
      ? getSignalConfidence(donor)
      : Math.min(1, lesson.confidence / 100);

    for (const target of recipients) {
      if (outcomes.length >= maxTransfers) break;
      const outcome = await transferToTarget({
        sourceBotId: donor?.botId ?? null,
        target,
        lesson: lesson.lesson ?? lesson.content,
        distilledBelief,
        memoryId: lesson.id,
        confidence,
      });
      outcomes.push(outcome);
    }
  }

  console.log(
    `[self-actualization] distillation: ${outcomes.length} transfers (${outcomes.filter((o) => o.status === "applied").length} applied, ${outcomes.filter((o) => o.status === "conflict").length} conflicts)`,
  );
  return outcomes;
}

function getSignalConfidence(cap: BotCapabilityModel): number {
  return Math.max(0, Math.min(1, cap.confidence));
}

/** Recent transfers for the console surface. */
export async function listKnowledgeTransfers(limit = 50) {
  return db
    .select()
    .from(knowledgeTransfersTable)
    .orderBy(desc(knowledgeTransfersTable.createdAt))
    .limit(limit);
}

// Re-exported for callers that want to check a specific bot's belief strength.
export { getCapabilitySignal };
