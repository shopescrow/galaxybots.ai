import { Router, type IRouter } from "express";
import {
  db,
  callLogsTable,
  callDebriefsTable,
  voiceScriptsTable,
  meetingRecordingsTable,
  receptionistConfigsTable,
  botsTable,
  clientsTable,
  pipelinesTable,
  pipelineStepsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireRole } from "../../middleware/auth";
import { llmRateLimit } from "../../middleware/rate-limit";
import { logLlmUsage } from "../../services/analytics/llm-usage";
import { executePipelineRun } from "../../services/missions/pipeline-engine";
import multer from "multer";
import fs from "fs";

const router: IRouter = Router();

const upload = multer({
  dest: "/tmp/voice-uploads",
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav", "audio/webm",
      "audio/ogg", "audio/x-m4a", "audio/m4a", "video/mp4", "video/webm",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|mp4|m4a|wav|webm|ogg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported audio format. Accepted: mp3, mp4, m4a, wav, webm, ogg"));
    }
  },
});

function enforceClientScope(reqClientId: number | undefined | null, paramClientId: number): boolean {
  return reqClientId === paramClientId;
}

async function findBotByTitle(titleFragment: string): Promise<{ id: number; name: string; title: string } | null> {
  const bots = await db.select().from(botsTable);
  const match = bots.find(b =>
    b.title.toLowerCase().includes(titleFragment.toLowerCase()) ||
    b.name.toLowerCase().includes(titleFragment.toLowerCase())
  );
  return match ? { id: match.id, name: match.name, title: match.title } : null;
}

async function transcribeAudioFile(filePath: string, originalName: string): Promise<string> {
  const fileStream = fs.createReadStream(filePath);
  const file = new File(
    [await fs.promises.readFile(filePath)],
    originalName,
    { type: "audio/mpeg" }
  );
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return transcription.text;
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
      model: "gpt-4o", // medium-complexity: structured call analysis
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

router.get("/voice/calls/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  if (!enforceClientScope(req.user!.clientId, clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { dateFrom, dateTo, status } = req.query as { dateFrom?: string; dateTo?: string; status?: string };

  try {
    const [config] = await db
      .select()
      .from(receptionistConfigsTable)
      .where(eq(receptionistConfigsTable.clientId, clientId));

    if (!config) {
      res.json([]);
      return;
    }

    const conditions: any[] = [eq(callLogsTable.configId, config.id)];
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) conditions.push(gte(callLogsTable.createdAt, d));
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) conditions.push(lte(callLogsTable.createdAt, d));
    }
    if (status && typeof status === "string") {
      conditions.push(eq(callLogsTable.status, status));
    }

    const calls = await db
      .select()
      .from(callLogsTable)
      .where(and(...conditions))
      .orderBy(desc(callLogsTable.createdAt))
      .limit(100);

    const callIds = calls.map(c => c.id);
    let debriefs: (typeof callDebriefsTable.$inferSelect)[] = [];
    if (callIds.length > 0) {
      debriefs = await db
        .select()
        .from(callDebriefsTable)
        .where(inArray(callDebriefsTable.callLogId, callIds));
    }

    const debriefMap = new Map(debriefs.map(d => [d.callLogId, d]));

    const result = calls.map(call => ({
      ...call,
      debrief: debriefMap.get(call.id) || null,
    }));

    res.json(result);
  } catch (err) {
    console.error("[Voice Intelligence] Call list error:", err);
    res.status(500).json({ error: "Failed to fetch calls" });
  }
});

router.post("/voice/debrief/:callLogId", requireRole("owner", "admin"), llmRateLimit, async (req, res): Promise<void> => {
  const callLogId = Number(req.params.callLogId);
  if (isNaN(callLogId)) {
    res.status(400).json({ error: "Invalid call log ID" });
    return;
  }

  try {
    const [callLog] = await db.select().from(callLogsTable).where(eq(callLogsTable.id, callLogId));
    if (!callLog) {
      res.status(404).json({ error: "Call log not found" });
      return;
    }

    const [config] = await db
      .select()
      .from(receptionistConfigsTable)
      .where(eq(receptionistConfigsTable.id, callLog.configId));

    if (!config) {
      res.status(404).json({ error: "Receptionist config not found" });
      return;
    }

    if (!enforceClientScope(req.user!.clientId, config.clientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!callLog.transcriptText) {
      res.status(400).json({ error: "No transcript available for this call" });
      return;
    }

    const [existing] = await db
      .select()
      .from(callDebriefsTable)
      .where(eq(callDebriefsTable.callLogId, callLogId));

    if (existing) {
      res.json(existing);
      return;
    }

    await generateCallDebrief(callLogId, config.clientId, callLog.transcriptText, callLog.fromNumber || undefined);

    const [debrief] = await db
      .select()
      .from(callDebriefsTable)
      .where(eq(callDebriefsTable.callLogId, callLogId));

    res.status(201).json(debrief);
  } catch (err) {
    console.error("[Voice Intelligence] Manual debrief error:", err);
    res.status(500).json({ error: "Failed to generate debrief" });
  }
});

const GenerateScriptBody = z.object({
  clientId: z.number(),
  scriptType: z.enum(["outbound", "voicemail"]),
  title: z.string().min(1),
  objective: z.string().min(1),
  targetPersona: z.string().optional(),
  desiredOutcome: z.string().optional(),
});

router.post("/voice/scripts", requireRole("owner", "admin"), llmRateLimit, async (req, res): Promise<void> => {
  const body = GenerateScriptBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { clientId, scriptType, title, objective, targetPersona, desiredOutcome } = body.data;

  if (!enforceClientScope(req.user!.clientId, clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    let prompt: string;
    let botTitle: string;

    if (scriptType === "voicemail") {
      botTitle = "sales director";
      prompt = `You are an expert Sales Director. Generate a natural-sounding voicemail script (20-30 seconds when spoken).

CONTEXT:
- Objective: ${objective}
${targetPersona ? `- Target: ${targetPersona}` : ""}
${desiredOutcome ? `- Desired Outcome: ${desiredOutcome}` : ""}

Write a concise, warm, professional voicemail that:
1. Identifies who is calling
2. States the purpose briefly
3. Creates curiosity or urgency
4. Includes a clear call-to-action
5. Is 50-75 words maximum

Return JSON:
{
  "script": "The voicemail script text",
  "estimatedDurationSeconds": 25,
  "tips": "Brief delivery tips"
}`;
    } else {
      botTitle = "sales director";
      prompt = `You are an expert Sales Director. Generate a comprehensive outbound call script.

CALL DETAILS:
- Objective: ${objective}
${targetPersona ? `- Target Persona: ${targetPersona}` : ""}
${desiredOutcome ? `- Desired Outcome: ${desiredOutcome}` : ""}

Create a structured call script with these sections:
1. Opening (warm greeting + reason for calling)
2. Discovery Questions (3-5 open-ended questions)
3. Value Proposition (key talking points)
4. Objection Handling (3 common objections with responses)
5. Close (next steps + call-to-action)

Return JSON:
{
  "script": "The full formatted script with sections clearly marked",
  "estimatedDurationMinutes": 10,
  "keyTalkingPoints": ["point1", "point2"]
}`;
    }

    const scriptStartMs = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // medium-complexity: structured script generation
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    const scriptLatencyMs = Date.now() - scriptStartMs;

    const bot = await findBotByTitle(botTitle);

    const scriptUsage = response.usage;
    if (scriptUsage) {
      logLlmUsage({
        clientId,
        botId: bot?.id ?? null,
        model: "gpt-4o",
        promptTokens: scriptUsage.prompt_tokens ?? 0,
        completionTokens: scriptUsage.completion_tokens ?? 0,
        latencyMs: scriptLatencyMs,
      });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "No response from AI" });
      return;
    }

    const parsed = JSON.parse(content);

    const [script] = await db
      .insert(voiceScriptsTable)
      .values({
        clientId,
        scriptType,
        title,
        objective,
        targetPersona: targetPersona || null,
        desiredOutcome: desiredOutcome || null,
        scriptContent: parsed.script,
        generatedBy: bot?.name || "Sales Director",
        metadata: parsed,
      })
      .returning();

    res.status(201).json(script);
  } catch (err) {
    console.error("[Voice Intelligence] Script generation error:", err);
    res.status(500).json({ error: "Failed to generate script" });
  }
});

router.get("/voice/scripts/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  if (!enforceClientScope(req.user!.clientId, clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const scripts = await db
      .select()
      .from(voiceScriptsTable)
      .where(eq(voiceScriptsTable.clientId, clientId))
      .orderBy(desc(voiceScriptsTable.createdAt))
      .limit(50);

    res.json(scripts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch scripts" });
  }
});

router.delete("/voice/scripts/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid script ID" });
    return;
  }

  const [script] = await db.select().from(voiceScriptsTable).where(eq(voiceScriptsTable.id, id));
  if (!script) {
    res.status(404).json({ error: "Script not found" });
    return;
  }

  if (!enforceClientScope(req.user!.clientId, script.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  await db.delete(voiceScriptsTable).where(eq(voiceScriptsTable.id, id));
  res.json({ success: true });
});

router.post("/voice/upload-recording", requireRole("owner", "admin"), llmRateLimit, upload.single("file"), async (req, res): Promise<void> => {
  const userClientId = req.user!.clientId;

  try {
    let clientId: number;
    let title: string;
    let transcript: string;
    let durationSeconds: number | null = null;
    let originalFilename: string | null = null;

    if (req.file) {
      clientId = Number(req.body.clientId);
      title = req.body.title || req.file.originalname;
      if (isNaN(clientId) || !title) {
        res.status(400).json({ error: "clientId and title required with file upload" });
        return;
      }

      if (!enforceClientScope(userClientId, clientId)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      originalFilename = req.file.originalname;

      const whisperStartMs = Date.now();
      transcript = await transcribeAudioFile(req.file.path, req.file.originalname);
      const whisperLatencyMs = Date.now() - whisperStartMs;

      logLlmUsage({
        clientId,
        model: "whisper-1",
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: whisperLatencyMs,
      });

      fs.unlink(req.file.path, () => {});

      if (req.body.durationSeconds) {
        durationSeconds = Number(req.body.durationSeconds) || null;
      }
    } else {
      const body = z.object({
        clientId: z.number(),
        title: z.string().min(1),
        transcript: z.string().min(1),
        durationSeconds: z.number().optional(),
        originalFilename: z.string().optional(),
      }).safeParse(req.body);

      if (!body.success) {
        res.status(400).json({ error: "Provide either an audio file or a JSON body with clientId, title, and transcript" });
        return;
      }

      clientId = body.data.clientId;
      title = body.data.title;
      transcript = body.data.transcript;
      durationSeconds = body.data.durationSeconds || null;
      originalFilename = body.data.originalFilename || null;

      if (!enforceClientScope(userClientId, clientId)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const [recording] = await db
      .insert(meetingRecordingsTable)
      .values({
        clientId,
        title,
        durationSeconds,
        transcriptText: transcript,
        originalFilename,
        status: "processing",
      })
      .returning();

    const summaryPrompt = `You are a Chief of Staff. Analyze this meeting transcript and produce a structured summary.

MEETING: ${title}
TRANSCRIPT:
${transcript.substring(0, 8000)}

Return JSON:
{
  "attendees": ["list of attendees mentioned"],
  "decisions": ["key decisions made"],
  "actionItems": [{"owner": "person", "task": "description", "deadline": "if mentioned"}],
  "openQuestions": ["unresolved questions"],
  "nextSteps": ["planned next steps"],
  "keyHighlights": "Brief 2-3 sentence summary of the meeting"
}`;

    const meetingStartMs = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // medium-complexity: meeting transcript summarization
      messages: [{ role: "user", content: summaryPrompt }],
      max_tokens: 1500,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    const meetingLatencyMs = Date.now() - meetingStartMs;

    const meetingUsage = response.usage;
    if (meetingUsage) {
      logLlmUsage({
        clientId,
        model: "gpt-4o",
        promptTokens: meetingUsage.prompt_tokens ?? 0,
        completionTokens: meetingUsage.completion_tokens ?? 0,
        latencyMs: meetingLatencyMs,
      });
    }

    const content = response.choices[0]?.message?.content;
    let summary = {};
    if (content) {
      try {
        summary = JSON.parse(content);
      } catch {}
    }

    await db
      .update(meetingRecordingsTable)
      .set({ summary, status: "completed" })
      .where(eq(meetingRecordingsTable.id, recording.id));

    const [updated] = await db
      .select()
      .from(meetingRecordingsTable)
      .where(eq(meetingRecordingsTable.id, recording.id));

    res.status(201).json(updated);
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error("[Voice Intelligence] Recording upload error:", err);
    res.status(500).json({ error: "Failed to process recording" });
  }
});

router.get("/voice/recordings/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  if (!enforceClientScope(req.user!.clientId, clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const recordings = await db
      .select()
      .from(meetingRecordingsTable)
      .where(eq(meetingRecordingsTable.clientId, clientId))
      .orderBy(desc(meetingRecordingsTable.createdAt))
      .limit(50);

    res.json(recordings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recordings" });
  }
});

router.get("/analytics/voice", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) {
    res.status(400).json({ error: "No client context" });
    return;
  }

  try {
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

    const [config] = await db
      .select()
      .from(receptionistConfigsTable)
      .where(eq(receptionistConfigsTable.clientId, clientId));

    if (!config) {
      res.json({
        totalCalls: 0,
        avgDurationSeconds: 0,
        callVolumeOverTime: [],
        urgencyDistribution: [],
        topIntents: [],
        leadConversionRate: 0,
        newProspects: 0,
        pipelinesTriggered: 0,
      });
      return;
    }

    const callConditions: any[] = [eq(callLogsTable.configId, config.id)];
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) callConditions.push(gte(callLogsTable.createdAt, d));
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) callConditions.push(lte(callLogsTable.createdAt, d));
    }

    const callStats = await db
      .select({
        totalCalls: sql<number>`COUNT(*)`,
        avgDuration: sql<number>`COALESCE(AVG(${callLogsTable.durationSeconds}), 0)`,
      })
      .from(callLogsTable)
      .where(and(...callConditions));

    const callVolume = await db
      .select({
        date: sql<string>`DATE(${callLogsTable.createdAt})`,
        count: sql<number>`COUNT(*)`,
        avgDuration: sql<number>`COALESCE(AVG(${callLogsTable.durationSeconds}), 0)`,
      })
      .from(callLogsTable)
      .where(and(...callConditions))
      .groupBy(sql`DATE(${callLogsTable.createdAt})`)
      .orderBy(sql`DATE(${callLogsTable.createdAt})`);

    const debriefConditions: any[] = [eq(callDebriefsTable.clientId, clientId)];
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) debriefConditions.push(gte(callDebriefsTable.createdAt, d));
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) debriefConditions.push(lte(callDebriefsTable.createdAt, d));
    }

    const urgencyDist = await db
      .select({
        urgency: callDebriefsTable.urgencyScore,
        count: sql<number>`COUNT(*)`,
      })
      .from(callDebriefsTable)
      .where(and(...debriefConditions))
      .groupBy(callDebriefsTable.urgencyScore)
      .orderBy(callDebriefsTable.urgencyScore);

    const topIntents = await db
      .select({
        intent: callDebriefsTable.callerIntent,
        count: sql<number>`COUNT(*)`,
      })
      .from(callDebriefsTable)
      .where(and(...debriefConditions))
      .groupBy(callDebriefsTable.callerIntent)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10);

    const prospectStats = await db
      .select({
        totalDebriefs: sql<number>`COUNT(*)`,
        newProspects: sql<number>`SUM(CASE WHEN ${callDebriefsTable.isNewProspect} = 1 THEN 1 ELSE 0 END)`,
        pipelineTriggered: sql<number>`SUM(CASE WHEN ${callDebriefsTable.pipelineTriggered} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(callDebriefsTable)
      .where(and(...debriefConditions));

    const totalCalls = Number(callStats[0]?.totalCalls || 0);
    const newProspects = Number(prospectStats[0]?.newProspects || 0);

    res.json({
      totalCalls,
      avgDurationSeconds: Math.round(Number(callStats[0]?.avgDuration || 0)),
      callVolumeOverTime: callVolume.map(v => ({
        date: v.date,
        count: Number(v.count),
        avgDuration: Math.round(Number(v.avgDuration)),
      })),
      urgencyDistribution: urgencyDist.map(u => ({
        urgency: u.urgency,
        count: Number(u.count),
      })),
      topIntents: topIntents
        .filter(i => i.intent)
        .map(i => ({
          intent: i.intent,
          count: Number(i.count),
        })),
      leadConversionRate: totalCalls > 0 ? Math.round((newProspects / totalCalls) * 100) : 0,
      newProspects,
      pipelinesTriggered: Number(prospectStats[0]?.pipelineTriggered || 0),
    });
  } catch (err) {
    console.error("[Voice Intelligence] Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch voice analytics" });
  }
});

export default router;
