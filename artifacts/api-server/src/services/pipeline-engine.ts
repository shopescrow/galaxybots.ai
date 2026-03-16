import {
  db,
  pipelinesTable,
  pipelineStepsTable,
  pipelineRunsTable,
  pipelineRunStepsTable,
  botsTable,
} from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { runAgenticLoop } from "../tools";
import { buildClientContext } from "./client-context";
import { getPackOverlayForBot } from "./pack-overlays";

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

  executeRunSteps(pipeline, run.id, runStepRows, triggerData).catch((err) => {
    console.error(`Pipeline run ${run.id} execution error:`, err);
    db.update(pipelineRunsTable)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(pipelineRunsTable.id, run.id))
      .catch(console.error);
  });

  return run;
}

async function executeRunSteps(
  pipeline: { id: number; clientId: number; name: string },
  runId: number,
  runSteps: Array<{ id: number; botId: number; stepOrder: number; instruction: string }>,
  triggerData: Record<string, unknown>,
) {
  let previousOutput = triggerData ? JSON.stringify(triggerData) : "";
  const clientContext = await buildClientContext(pipeline.clientId);
  let allSucceeded = true;

  for (const runStep of runSteps) {
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

    const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}
${clientContext}${packOverlay}

You are executing step ${runStep.stepOrder} of the "${pipeline.name}" pipeline.
Your instruction for this step: ${runStep.instruction}

${previousOutput ? `Context from previous step:\n${previousOutput}` : "This is the first step in the pipeline."}

Complete your assigned task thoroughly and provide a clear summary of what you accomplished. Your output will be passed as context to the next step in the pipeline.`;

    try {
      const { finalContent } = await runAgenticLoop({
        model: "gpt-4o-mini",
        maxIterations: 10,
        maxTokens: 1000,
        systemPrompt,
        messages: [
          {
            role: "user",
            content: runStep.instruction,
          },
        ],
        context: {
          sessionId: runId,
          botId: bot.id,
          botName: bot.name,
          clientId: pipeline.clientId,
        },
      });

      const output = finalContent || "Step completed without output.";
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
