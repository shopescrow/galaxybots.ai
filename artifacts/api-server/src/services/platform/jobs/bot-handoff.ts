import {
  db,
  botHandoffRequestsTable,
  botAssignmentsTable,
  botsTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createNotification } from "../../admin/notifications";
import { broadcastSSE } from "../sse";

interface HandoffRequest {
  sourceBotId: number;
  clientId: number;
  sessionId?: number;
  assignmentId?: number;
  reason: string;
  terminationReason: string;
  context: Record<string, unknown>;
  recommendedRecipientName?: string;
}

async function findTargetBot(
  recommendedName: string | undefined,
  reason: string,
  allBots: typeof botsTable.$inferSelect[],
): Promise<typeof botsTable.$inferSelect | null> {
  if (recommendedName) {
    const exact = allBots.find(
      (b) => b.name.toLowerCase().includes(recommendedName.toLowerCase()),
    );
    if (exact) return exact;
  }

  if (allBots.length === 0) return null;

  const botList = allBots
    .map((b) => `ID ${b.id}: ${b.name} (${b.department}) — ${b.responsibilities?.slice(0, 2).join(", ")}`)
    .join("\n");

  const prompt = `A bot needs to hand off a task. Find the best specialist bot to receive it.

Handoff reason: "${reason}"

Available bots:
${botList}

Respond with JSON: { "botId": <id>, "reasoning": "why this bot" }`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 200,
      messages: [
        { role: "system", content: "Select the best bot for a task handoff. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    const targetId = parsed.botId;
    return allBots.find((b) => b.id === targetId) ?? null;
  } catch {
    return null;
  }
}

export async function emitBotHandoffRequest(request: HandoffRequest): Promise<void> {
  const clientBotIds = await db
    .select({ botId: botAssignmentsTable.botId })
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.clientId, request.clientId));

  const botIdSet = [...new Set(clientBotIds.map((r) => r.botId).filter((id): id is number => id !== null))];

  if (botIdSet.length === 0) {
    console.log(`[bot-handoff] No bots found for client ${request.clientId} — skipping handoff`);
    return;
  }

  const allBots = await db.select().from(botsTable).where(inArray(botsTable.id, botIdSet));
  const sourceBotFiltered = allBots.filter((b) => b.id !== request.sourceBotId);

  const targetBot = await findTargetBot(
    request.recommendedRecipientName,
    request.reason,
    sourceBotFiltered,
  );

  const [handoff] = await db
    .insert(botHandoffRequestsTable)
    .values({
      sourceBotId: request.sourceBotId,
      targetBotId: targetBot?.id ?? null,
      clientId: request.clientId,
      sessionId: request.sessionId ?? null,
      assignmentId: request.assignmentId ?? null,
      reason: request.reason,
      terminationReason: request.terminationReason,
      context: request.context,
      recommendedRecipientName: request.recommendedRecipientName ?? null,
      status: "pending",
    })
    .returning();

  const sourceBot = allBots.find((b) => b.id === request.sourceBotId);

  if (targetBot) {
    await db
      .update(botHandoffRequestsTable)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(eq(botHandoffRequestsTable.id, handoff.id));

    const [newAssignment] = await db
      .insert(botAssignmentsTable)
      .values({
        botId: targetBot.id,
        clientId: request.clientId,
        objective: `[Handoff from ${sourceBot?.name ?? "Bot"}] ${request.reason}`,
        schedule: "daily",
        isActive: "true",
        actionMode: "active",
        actionPrompt: JSON.stringify(request.context),
        generatedBy: "autonomous",
        priorityTier: 1,
        evidenceChain: [
          `Handed off from ${sourceBot?.name ?? "unknown"}: ${request.terminationReason}`,
        ],
      })
      .returning();

    await db
      .update(botHandoffRequestsTable)
      .set({ resultingAssignmentId: newAssignment.id })
      .where(eq(botHandoffRequestsTable.id, handoff.id));

    createNotification({
      clientId: request.clientId,
      category: "bot",
      severity: "info",
      title: `Task handed off to ${targetBot.name}`,
      body: `${sourceBot?.name ?? "A bot"} identified a gap and routed this task to ${targetBot.name}: "${request.reason}"`,
      link: "/command-center",
      metadata: {
        handoffId: handoff.id,
        sourceBotId: request.sourceBotId,
        targetBotId: targetBot.id,
        assignmentId: newAssignment.id,
      },
      isScheduled: true,
    }).catch(() => {});

    broadcastSSE("bot-handoff-routed", {
      clientId: request.clientId,
      handoffId: handoff.id,
      sourceBotName: sourceBot?.name,
      targetBotName: targetBot.name,
      reason: request.reason,
      assignmentId: newAssignment.id,
    });

    console.log(
      `[bot-handoff] Routed from ${sourceBot?.name} → ${targetBot.name}: "${request.reason}"`,
    );
  } else {
    createNotification({
      clientId: request.clientId,
      category: "bot",
      severity: "warning",
      title: `Bot handoff needs routing — no specialist found`,
      body: `${sourceBot?.name ?? "A bot"} needs to hand off: "${request.reason}". No specialist bot identified automatically.`,
      link: "/command-center",
      metadata: { handoffId: handoff.id, sourceBotId: request.sourceBotId },
      isScheduled: true,
    }).catch(() => {});

    console.log(
      `[bot-handoff] No target found for handoff from ${sourceBot?.name}: "${request.reason}"`,
    );
  }
}
