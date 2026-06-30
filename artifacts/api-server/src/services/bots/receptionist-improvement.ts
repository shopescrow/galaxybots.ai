import { db, callLogsTable, receptionistConfigsTable, callImprovementRunsTable, toolActivityLogTable, botsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";
import { storeMemory, retrieveMemories } from "./memory";
import type { ReceptionistConfig } from "@workspace/db";

const DEFAULT_IMPROVEMENT_THRESHOLD = 10;

export async function shouldRunImprovement(config: ReceptionistConfig): Promise<boolean> {
  return config.improvementCallCount >= DEFAULT_IMPROVEMENT_THRESHOLD;
}

async function findVeraBotId(clientId: number): Promise<number | null> {
  const [bot] = await db
    .select({ id: botsTable.id })
    .from(botsTable)
    .where(eq(botsTable.addonType, "receptionist"));
  return bot?.id ?? null;
}

export async function storeCallTranscriptMemory(params: {
  botId: number;
  configId: number;
  callLogId: number;
  transcript: string;
  summary: string;
}): Promise<void> {
  try {
    await storeMemory({
      botId: params.botId,
      sourceType: "receptionist_call",
      sourceId: params.callLogId,
      content: params.transcript,
      summary: params.summary,
      topic: `receptionist_config_${params.configId}`,
    });
  } catch (err) {
    console.error("[AI Receptionist] Failed to store call transcript in memory:", err);
  }
}

export async function runImprovementPass(configId: number): Promise<{ success: boolean; error?: string }> {
  const [config] = await db
    .select()
    .from(receptionistConfigsTable)
    .where(eq(receptionistConfigsTable.id, configId));

  if (!config) {
    return { success: false, error: "Config not found" };
  }

  const recentCalls = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.configId, configId))
    .orderBy(desc(callLogsTable.createdAt))
    .limit(DEFAULT_IMPROVEMENT_THRESHOLD * 2);

  const transcripts = recentCalls
    .filter(c => c.transcriptText)
    .map(c => ({
      direction: c.direction,
      duration: c.durationSeconds,
      transcript: c.transcriptText,
      summary: c.transcriptSummary,
    }));

  if (transcripts.length === 0) {
    return { success: false, error: "No transcripts available for improvement" };
  }

  const currentPrompt = config.knowledgeBasePrompt || "No knowledge base prompt configured.";

  let priorMemoryContext = "";
  const veraBotId = await findVeraBotId(config.clientId);
  if (veraBotId) {
    try {
      const relevantMemories = await retrieveMemories({
        botId: veraBotId,
        query: `receptionist call patterns, common questions, improvement areas for ${config.businessName || "business"}`,
        limit: 5,
      });
      if (relevantMemories.length > 0) {
        priorMemoryContext = `\n## Prior Memory Context (from long-term memory)\n${relevantMemories.map((m, i) => `${i + 1}. ${m.summary}`).join("\n")}\n`;
      }
    } catch (err) {
      console.warn("[AI Receptionist] Failed to retrieve memories for improvement:", err);
    }
  }

  const improvementPrompt = `You are an AI receptionist knowledge base optimizer. Analyze the following call transcripts and the current knowledge base prompt, then produce an improved version of the prompt.

## Current Knowledge Base Prompt
${currentPrompt}
${priorMemoryContext}
## Recent Call Transcripts (${transcripts.length} calls)
${transcripts.map((t, i) => `### Call ${i + 1} (${t.direction}, ${t.duration || 0}s)
${t.transcript}
Summary: ${t.summary || "N/A"}`).join("\n\n")}

## Instructions
1. Identify common questions that callers asked
2. Identify any questions the receptionist could not answer well
3. Identify routing failures or confusion patterns
4. Produce an improved knowledge base prompt that addresses these gaps
5. Keep all existing useful information from the current prompt
6. Add new FAQ entries or guidance based on the call patterns
7. Consider any prior memory context for historical patterns

Return your response in this JSON format:
{
  "improved_prompt": "the full improved knowledge base prompt text",
  "notes": "brief notes about what was changed and why"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
      messages: [{ role: "user", content: improvementPrompt }],
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { success: false, error: "No response from AI" };
    }

    const parsed = JSON.parse(content) as { improved_prompt: string; notes: string };

    await db.insert(callImprovementRunsTable).values({
      configId,
      callsAnalyzed: transcripts.length,
      oldPromptSnapshot: currentPrompt,
      newPrompt: parsed.improved_prompt,
      improvementNotes: parsed.notes,
    });

    await db
      .update(receptionistConfigsTable)
      .set({
        knowledgeBasePrompt: parsed.improved_prompt,
        improvementCallCount: 0,
        lastImprovedAt: new Date(),
      })
      .where(eq(receptionistConfigsTable.id, configId));

    if (veraBotId) {
      try {
        await storeMemory({
          botId: veraBotId,
          sourceType: "receptionist_improvement",
          sourceId: configId,
          content: `Improvement pass analyzed ${transcripts.length} calls. Changes: ${parsed.notes}`,
          summary: `Knowledge base improvement: ${parsed.notes}`,
          topic: `receptionist_config_${configId}`,
        });
      } catch (err) {
        console.warn("[AI Receptionist] Failed to store improvement memory:", err);
      }
    }

    await db.insert(toolActivityLogTable).values({
      toolName: "receptionist_improvement",
      clientId: config.clientId,
      botName: "Vera",
      metadata: {
        configId,
        callsAnalyzed: transcripts.length,
        notes: parsed.notes,
      },
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Improvement pass failed" };
  }
}
