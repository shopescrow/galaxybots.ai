import {
  db,
  callDebriefsTable,
  botsTable,
  pipelinesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logLlmUsage } from "../analytics/llm-usage";
import { executePipelineRun } from "../missions/pipeline-engine";

async function findBotByTitle(titleFragment: string): Promise<{ id: number; name: string; title: string } | null> {
  const bots = await db.select().from(botsTable);
  const match = bots.find(b =>
    b.title.toLowerCase().includes(titleFragment.toLowerCase()) ||
    b.name.toLowerCase().includes(titleFragment.toLowerCase())
  );
  return match ? { id: match.id, name: match.name, title: match.title } : null;
}

async function triggerNewProspectPipeline(clientId: number, debriefData: Record<string, unknown>): Promise<boolean> {
  try {
    const clientPipelines = await db
      .select()
      .from(pipelinesTable)
      .where(and(
        eq(pipelinesTable.clientId, clientId),
        eq(pipelinesTable.active, true),
      ));

    const leadPipeline = clientPipelines.find(p =>
      p.name.toLowerCase().includes("lead") ||
      p.name.toLowerCase().includes("prospect") ||
      p.name.toLowerCase().includes("intake")
    );

    if (leadPipeline) {
      await executePipelineRun(leadPipeline.id, "voice_debrief", {
        source: "call_debrief",
        callerName: debriefData.callerName,
        callerIntent: debriefData.callerIntent,
        urgencyScore: debriefData.urgencyScore,
        clientId,
      });
      console.log(`[Voice Intelligence] Triggered pipeline ${leadPipeline.id} for new prospect (client ${clientId})`);
      return true;
    }
    return false;
  } catch (err) {
    console.error("[Voice Intelligence] Pipeline trigger failed:", err);
    return false;
  }
}

export async function generateCallDebrief(callLogId: number, clientId: number, transcript: string, callerInfo?: string): Promise<void> {
  try {
    const [existing] = await db
      .select()
      .from(callDebriefsTable)
      .where(eq(callDebriefsTable.callLogId, callLogId));
    if (existing) return;

    const salesBot = await findBotByTitle("sales director");
    const botName = salesBot?.name || "Sales Director";

    const debriefPrompt = `You are ${botName}, an expert Sales Director. Analyze this call transcript and produce a structured debrief.

CALL TRANSCRIPT:
${transcript}

${callerInfo ? `CALLER INFO: ${callerInfo}` : ""}

Produce a JSON response with this exact structure:
{
  "callerName": "Name if mentioned, or 'Unknown'",
  "callerIntent": "Brief description of what the caller wanted",
  "keyConcerns": "Main concerns or objections raised",
  "urgencyScore": 3,
  "recommendedAction": "Specific next step recommended",
  "followUpMessage": "Draft follow-up message to send to the caller",
  "isNewProspect": true
}

urgencyScore should be 1-5 (1=low, 5=critical).
isNewProspect should be true if the caller appears to be a new potential customer.`;

    const startMs = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: debriefPrompt }],
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    const latencyMs = Date.now() - startMs;

    const usage = response.usage;
    if (usage) {
      logLlmUsage({
        clientId,
        botId: salesBot?.id ?? null,
        model: "gpt-4o",
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs,
      });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) return;

    const parsed = JSON.parse(content) as {
      callerName: string;
      callerIntent: string;
      keyConcerns: string;
      urgencyScore: number;
      recommendedAction: string;
      followUpMessage: string;
      isNewProspect: boolean;
    };

    let pipelineTriggered = 0;
    if (parsed.isNewProspect) {
      const triggered = await triggerNewProspectPipeline(clientId, parsed);
      if (triggered) pipelineTriggered = 1;
    }

    await db.insert(callDebriefsTable).values({
      callLogId,
      clientId,
      callerName: parsed.callerName || null,
      callerIntent: parsed.callerIntent || null,
      keyConcerns: parsed.keyConcerns || null,
      urgencyScore: Math.min(5, Math.max(1, parsed.urgencyScore || 3)),
      recommendedAction: parsed.recommendedAction || null,
      followUpMessage: parsed.followUpMessage || null,
      isNewProspect: parsed.isNewProspect ? 1 : 0,
      pipelineTriggered,
      rawDebrief: parsed,
    });

    console.log(`[Voice Intelligence] Debrief generated for call ${callLogId} (prospect=${parsed.isNewProspect}, pipeline=${pipelineTriggered})`);
  } catch (err) {
    console.error("[Voice Intelligence] Debrief generation failed:", err);
  }
}
