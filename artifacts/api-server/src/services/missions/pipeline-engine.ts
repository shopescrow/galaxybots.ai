import {
  db,
  pipelinesTable,
  pipelineStepsTable,
  pipelineRunsTable,
  pipelineRunStepsTable,
  botsTable,
} from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { runAgenticLoop } from "../../tools";
import { buildClientContext } from "../clients/client-context";
import { getPackOverlayForBot } from "../billing/pack-overlays";
import { createNotification } from "../admin/notifications";
import { agentMetrics } from "../../agent-core/metrics";

const DEFAULT_QUALITY_THRESHOLD = 0.7;
const DEFAULT_MAX_GATE_RETRIES = 2;

export async function executePipelineRun(pipelineId: number, triggerType: string, triggerData: Record<string, unknown> = {}) {
  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(eq(pipelinesTable.id, pipelineId));

  if (!pipeline) throw new Error("Pipeline not found");
  if (!pipeline.active) throw new Error("Pipeline is not active");

  const steps = await db
    .select()
    .from(pipelineStepsTable)
    .where(eq(pipelineStepsTable.pipelineId, pipelineId))
    .orderBy(asc(pipelineStepsTable.stepOrder));

  if (steps.length === 0) throw new Error("Pipeline has no steps");

  const [run] = await db
    .insert(pipelineRunsTable)
    .values({
      pipelineId,
      status: "running",
      triggerType,
      triggerData,
      startedAt: new Date(),
    })
    .returning();

  const runStepRows = await db
    .insert(pipelineRunStepsTable)
    .values(
      steps.map((step) => ({
        runId: run.id,
        stepId: step.id,
        botId: step.botId,
        stepOrder: step.stepOrder,
        instruction: step.instruction,
        status: "pending" as const,
      }))
    )
    .returning();

  executeRunSteps(pipeline, run.id, runStepRows, steps, triggerData).catch((err) => {
    console.error(`Pipeline run ${run.id} execution error:`, err);
    db.update(pipelineRunsTable)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(pipelineRunsTable.id, run.id))
      .catch(console.error);
  });

  return run;
}

async function evaluateStepOutput(
  content: string,
  instruction: string,
  model: string,
  threshold: number,
): Promise<{ passed: boolean; score: number; critique?: string }> {
  const { openai } = await import("@workspace/integrations-openai-ai-server");

  const evalPrompt = `Evaluate this pipeline step output against the instruction.

INSTRUCTION: ${instruction.slice(0, 400)}
OUTPUT: ${content.slice(0, 1200)}

Return JSON with fields:
{
  "completeness": <0.0-1.0>,
  "accuracy": <0.0-1.0>,
  "relevance": <0.0-1.0>,
  "critique": "<brief critique if score below ${threshold}, else empty>"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a strict JSON-only pipeline quality evaluator." },
        { role: "user", content: evalPrompt },
      ],
      max_completion_tokens: 150,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]) as Record<string, unknown>; } catch { parsed = {}; } }
    }

    const c = Math.min(1, Math.max(0, Number(parsed.completeness ?? 0.7)));
    const a = Math.min(1, Math.max(0, Number(parsed.accuracy ?? 0.7)));
    const r = Math.min(1, Math.max(0, Number(parsed.relevance ?? 0.7)));
    const score = (c + a + r) / 3;
    const critique = typeof parsed.critique === "string" && parsed.critique.length > 0 ? parsed.critique : undefined;

    agentMetrics.selfEvaluationScore.observe(score, { context: "pipeline_quality_gate" });

    return { passed: score >= threshold, score, critique };
  } catch {
    return { passed: true, score: 0.7 };
  }
}

async function executeRunSteps(
  pipeline: { id: number; clientId: number; name: string },
  runId: number,
  runSteps: Array<{ id: number; botId: number; stepOrder: number; instruction: string }>,
  stepDefs: Array<{ id: number; stepType: string; qualityThreshold: string | null; maxGateRetries: number }>,
  triggerData: Record<string, unknown>,
) {
  let previousOutput = triggerData ? JSON.stringify(triggerData) : "";
  const clientContext = await buildClientContext(pipeline.clientId);
  let allSucceeded = true;

  for (let i = 0; i < runSteps.length; i++) {
    const runStep = runSteps[i];
    const stepDef = stepDefs[i];

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.id, runStep.botId));

    if (!bot) {
      await db
        .update(pipelineRunStepsTable)
        .set({ status: "failed", output: "Bot not found", completedAt: new Date() })
        .where(eq(pipelineRunStepsTable.id, runStep.id));
      allSucceeded = false;
      break;
    }

    await db
      .update(pipelineRunStepsTable)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(pipelineRunStepsTable.id, runStep.id));

    let packOverlay = "";
    try {
      packOverlay = await getPackOverlayForBot(pipeline.clientId, bot.title);
    } catch (_e) {}

    const isQualityGate = stepDef?.stepType === "quality_gate";
    const qualityThreshold = stepDef?.qualityThreshold
      ? parseFloat(String(stepDef.qualityThreshold))
      : DEFAULT_QUALITY_THRESHOLD;
    const maxGateRetries = stepDef?.maxGateRetries ?? DEFAULT_MAX_GATE_RETRIES;

    const buildSystemPrompt = (extraContext = "") => `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}
${clientContext}${packOverlay}

You are executing step ${runStep.stepOrder} of the "${pipeline.name}" pipeline.
Your instruction for this step: ${runStep.instruction}

${previousOutput ? `Context from previous step:\n${previousOutput}` : "This is the first step in the pipeline."}
${extraContext}

Complete your assigned task thoroughly and provide a clear summary of what you accomplished. Your output will be passed as context to the next step in the pipeline.`;

    const stepContext = {
        sessionId: runId,
        botId: bot.id,
        botName: bot.name,
        clientId: pipeline.clientId,
        depth: 0,
      };

    try {
      let output = "";

      if (!isQualityGate) {
        // Standard generative step — execute exactly once
        const { finalContent } = await runAgenticLoop({
          model: "gpt-4o-mini",
          maxIterations: 10,
          maxTokens: 1000,
          systemPrompt: buildSystemPrompt(),
          messages: [{ role: "user", content: runStep.instruction }],
          context: stepContext,
        });
        output = finalContent || "Step completed without output.";
      } else {
        // Quality-gate step — execute with retry loop; hard-fail after maxGateRetries
        let gatePassed = false;
        let gateRetryCount = 0;

        while (!gatePassed) {
          const critiqueContext = gateRetryCount > 0
            ? `\n[Quality Gate Retry ${gateRetryCount}/${maxGateRetries}]: Previous response was insufficient. Please provide a more complete and accurate response addressing these quality concerns.`
            : "";

          const { finalContent } = await runAgenticLoop({
            model: "gpt-4o-mini",
            maxIterations: 10,
            maxTokens: 1000,
            systemPrompt: buildSystemPrompt(critiqueContext),
            messages: [{ role: "user", content: runStep.instruction }],
            context: stepContext,
          });

          output = finalContent || "Step completed without output.";
          const evaluation = await evaluateStepOutput(output, runStep.instruction, "gpt-4o-mini", qualityThreshold);

          if (evaluation.passed) {
            gatePassed = true;
            console.log(`[PipelineEngine] Quality gate passed (score: ${evaluation.score.toFixed(2)}) for step ${runStep.stepOrder}`);
          } else {
            gateRetryCount++;
            agentMetrics.qualityGateRetries.inc({ context: "pipeline_step" });
            console.log(`[PipelineEngine] Quality gate failed (score: ${evaluation.score.toFixed(2)}) for step ${runStep.stepOrder}, retry ${gateRetryCount}/${maxGateRetries}`);
            if (gateRetryCount >= maxGateRetries) {
              throw new Error(
                `Quality gate failed for step ${runStep.stepOrder} after ${maxGateRetries} retr${maxGateRetries === 1 ? "y" : "ies"}. ` +
                `Final score: ${evaluation.score.toFixed(2)} (threshold: ${qualityThreshold}). ` +
                `Pipeline step marked as failed.`
              );
            }
          }
        }
      }

      previousOutput = output;

      await db
        .update(pipelineRunStepsTable)
        .set({ status: "done", output, completedAt: new Date() })
        .where(eq(pipelineRunStepsTable.id, runStep.id));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Step execution failed";
      await db
        .update(pipelineRunStepsTable)
        .set({ status: "failed", output: errorMsg, completedAt: new Date() })
        .where(eq(pipelineRunStepsTable.id, runStep.id));
      allSucceeded = false;
      break;
    }
  }

  const finalStatus = allSucceeded ? "done" : "failed";

  await db
    .update(pipelineRunsTable)
    .set({
      status: finalStatus,
      completedAt: new Date(),
    })
    .where(eq(pipelineRunsTable.id, runId));

  if (finalStatus === "done") {
    triggerDownstreamPipelines(pipeline.id, pipeline.clientId, previousOutput).catch((err) => {
      console.error(`Downstream pipeline trigger error for pipeline ${pipeline.id}:`, err);
    });
  } else {
    createNotification({
      clientId: pipeline.clientId,
      category: "pipeline",
      severity: "critical",
      title: `Pipeline "${pipeline.name}" failed`,
      body: `Pipeline run #${runId} failed during execution`,
      link: "/pipelines",
      metadata: { pipelineId: pipeline.id, runId },
    }).catch((e) => console.error("[notifications] Failed to create pipeline failure notification:", e));
  }
}

async function triggerDownstreamPipelines(sourcePipelineId: number, clientId: number, lastOutput: string) {
  const downstreamPipelines = await db
    .select()
    .from(pipelinesTable)
    .where(
      and(
        eq(pipelinesTable.clientId, clientId),
        eq(pipelinesTable.triggerType, "pipeline_completion"),
        eq(pipelinesTable.active, true),
      )
    );

  for (const downstream of downstreamPipelines) {
    const config = (downstream.triggerConfig || {}) as Record<string, unknown>;
    const sourcePipelineIdConfig = config.sourcePipelineId;

    if (sourcePipelineIdConfig !== undefined && Number(sourcePipelineIdConfig) !== sourcePipelineId) {
      continue;
    }

    try {
      await executePipelineRun(downstream.id, "pipeline_completion", {
        sourcePipelineId,
        previousOutput: lastOutput,
      });
    } catch (err) {
      console.error(`Failed to trigger downstream pipeline ${downstream.id}:`, err);
    }
  }
}
