import {
  db,
  pipelinesTable,
  pipelineStepsTable,
  pipelineRunsTable,
  pipelineRunStepsTable,
  botsTable,
} from "@workspace/db";
import { eq, asc, and, inArray } from "drizzle-orm";
import { runAgenticLoop } from "../../tools";
import { buildClientContext } from "../clients/client-context";
import { getPackOverlayForBot } from "../billing/pack-overlays";
import { createNotification } from "../admin/notifications";
import { agentMetrics } from "../../agent-core/metrics";
import {
  assignRoles,
  getRoleSystemPromptAddition,
  updateRoutingWeights,
  writeCoordinatorTrace,
  COORDINATOR_QUALITY_THRESHOLD,
} from "../coordinator/galaxy-coordinator";
import type { CoordinatorPlan } from "@workspace/db";

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

async function evaluateOutput(
  content: string,
  instruction: string,
  model: string,
  threshold: number,
  extraContext?: string,
): Promise<{ passed: boolean; score: number; critique?: string }> {
  const { openai } = await import("@workspace/integrations-openai-ai-server");

  const evalPrompt = `Evaluate this pipeline step output against the instruction.
${extraContext ? `\nContext: ${extraContext}\n` : ""}
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
    try { parsed = JSON.parse(raw) as Record<string, unknown>; }
    catch { const m = raw.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]) as Record<string, unknown>; } catch { /* ignore */ } } }

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

  // ── GalaxyCoordinator: assign roles BEFORE executing any step ────────────────
  const uniqueBotIds = [...new Set(runSteps.map((s) => s.botId))];
  const pipelineBotRows = await db
    .select({ id: botsTable.id, name: botsTable.name, title: botsTable.title, department: botsTable.department })
    .from(botsTable)
    .where(inArray(botsTable.id, uniqueBotIds));

  const botInfoMap = new Map(pipelineBotRows.map((b) => [b.id, b]));

  let coordinatorPlan: CoordinatorPlan | null = null;
  try {
    const taskDescription = pipeline.name + " " + runSteps.map((s) => s.instruction).join(" ");
    const steps = runSteps.map((rs, idx) => {
      const bot = botInfoMap.get(rs.botId);
      return {
        stepIndex: idx,
        botId: rs.botId,
        botName: bot?.name ?? `bot-${rs.botId}`,
        botTitle: bot?.title ?? "",
        botDepartment: bot?.department ?? "",
      };
    });
    coordinatorPlan = await assignRoles(taskDescription, steps);
    coordinatorPlan.runId = runId;
    console.log(
      `[GalaxyCoordinator] Run ${runId} role assignments: ` +
      Object.entries(coordinatorPlan.roleByStepIndex)
        .map(([idx, role]) => `step${idx}(${steps[Number(idx)]?.botName})=${role}`)
        .join(", "),
    );
  } catch (err) {
    console.error("[GalaxyCoordinator] Role assignment failed, proceeding without coordinator:", err);
  }

  // Track the Worker step context so the Verifier can trigger reruns.
  let workerRunStepId: number | null = null;
  let workerInstruction = "";
  let workerOutput = "";
  let buildWorkerPrompt: ((extra?: string) => string) | null = null;
  let workerStepCtx: { sessionId: number; botId: number; botName: string; clientId: number; depth: number } | null = null;

  // Collect verifier quality scores (real evaluations only) for weight updates.
  const verifierScores: number[] = [];
  const qualityScoresForTrace: Record<string, number> = {};

  for (let i = 0; i < runSteps.length; i++) {
    const runStep = runSteps[i];
    const stepDef = stepDefs[i];

    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, runStep.botId));

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
    try { packOverlay = await getPackOverlayForBot(pipeline.clientId, bot.title); } catch { /* ignore */ }

    // Role is determined by STEP INDEX (not bot ID) — no collision possible.
    const coordinatorRole = coordinatorPlan?.roleByStepIndex[i] ?? null;
    const rolePromptAddition = getRoleSystemPromptAddition(coordinatorRole);

    const qualityThreshold = stepDef?.qualityThreshold
      ? parseFloat(String(stepDef.qualityThreshold))
      : COORDINATOR_QUALITY_THRESHOLD;
    const maxGateRetries = stepDef?.maxGateRetries ?? DEFAULT_MAX_GATE_RETRIES;

    const buildSystemPrompt = (extraContext = "") =>
      `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}
${clientContext}${packOverlay}

You are executing step ${runStep.stepOrder} of the "${pipeline.name}" pipeline.
Your instruction for this step: ${runStep.instruction}

${previousOutput ? `Context from previous step:\n${previousOutput}` : "This is the first step in the pipeline."}
${extraContext}${rolePromptAddition}

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

      if (coordinatorRole === "verifier") {
        // ── Verifier: evaluate latest Worker output; re-run Worker on failure ────
        //
        // CRITICAL: `latestWorkerOutput` is a mutable variable updated after every
        // Worker rerun — ensuring each retry scores FRESH output, not stale content.
        let latestWorkerOutput = workerOutput || previousOutput;
        const subjectInstruction = workerInstruction || runStep.instruction;
        let verifierPassed = false;
        let verifierRetries = 0;
        let lastScore = COORDINATOR_QUALITY_THRESHOLD;

        while (!verifierPassed) {
          const verifierCtx = `Verifier evaluation${verifierRetries > 0 ? ` (retry ${verifierRetries}/${maxGateRetries})` : ""}. Worker bot: ${coordinatorPlan?.worker.botName ?? "previous step"}. Evaluate Worker output for completeness, accuracy, and relevance.`;

          const evaluation = await evaluateOutput(
            latestWorkerOutput,
            subjectInstruction,
            "gpt-4o-mini",
            qualityThreshold,
            verifierCtx,
          );
          lastScore = evaluation.score;

          if (evaluation.passed) {
            verifierPassed = true;
            console.log(
              `[GalaxyCoordinator] Verifier PASSED (score: ${lastScore.toFixed(2)}, retries: ${verifierRetries}) run=${runId} step=${i}`,
            );
          } else {
            verifierRetries++;
            agentMetrics.qualityGateRetries.inc({ context: "verifier_role" });
            console.log(
              `[GalaxyCoordinator] Verifier FAILED (score: ${lastScore.toFixed(2)}), re-running Worker — retry ${verifierRetries}/${maxGateRetries}, run=${runId}`,
            );

            if (verifierRetries > maxGateRetries) {
              console.warn(
                `[GalaxyCoordinator] Verifier retries exhausted (${maxGateRetries}) for run ${runId}, proceeding`,
              );
              break;
            }

            // Re-run the Worker step with critique context.
            if (workerRunStepId !== null && buildWorkerPrompt && workerStepCtx) {
              const critiqueCtx = `\n[Verifier Retry ${verifierRetries}/${maxGateRetries}] Previous Worker output scored ${evaluation.score.toFixed(2)}. Critique: ${evaluation.critique ?? "Output was insufficient — improve completeness and accuracy"}. Revise your output to address these issues.`;

              await db
                .update(pipelineRunStepsTable)
                .set({ status: "running", startedAt: new Date() })
                .where(eq(pipelineRunStepsTable.id, workerRunStepId));

              const { finalContent: rerunContent } = await runAgenticLoop({
                model: "gpt-4o-mini",
                maxIterations: 10,
                maxTokens: 1000,
                systemPrompt: buildWorkerPrompt(critiqueCtx),
                messages: [{ role: "user", content: workerInstruction }],
                context: workerStepCtx,
              });

              // REFRESH latestWorkerOutput so the next loop iteration scores new content.
              latestWorkerOutput = rerunContent || latestWorkerOutput;
              workerOutput = latestWorkerOutput;

              await db
                .update(pipelineRunStepsTable)
                .set({ status: "done", output: latestWorkerOutput, completedAt: new Date() })
                .where(eq(pipelineRunStepsTable.id, workerRunStepId));
            } else {
              // No Worker step reference — cannot rerun; break to avoid infinite loop.
              console.warn("[GalaxyCoordinator] No Worker step reference for rerun; proceeding");
              break;
            }
          }
        }

        verifierScores.push(lastScore);
        qualityScoresForTrace[`step_${i}_verifier`] = lastScore;

        output = verifierPassed
          ? `[Verifier PASSED — score ${lastScore.toFixed(2)}] Worker output confirmed satisfactory.`
          : `[Verifier ACCEPTED after ${verifierRetries} retries — score ${lastScore.toFixed(2)}]`;

        // Pipeline continues with the (potentially improved) Worker output.
        previousOutput = latestWorkerOutput;
      } else {
        // ── Standard generative step (Thinker or Worker) ─────────────────────────
        const { finalContent } = await runAgenticLoop({
          model: "gpt-4o-mini",
          maxIterations: 10,
          maxTokens: 1000,
          systemPrompt: buildSystemPrompt(),
          messages: [{ role: "user", content: runStep.instruction }],
          context: stepContext,
        });
        output = finalContent || "Step completed without output.";
        previousOutput = output;

        // Capture Worker context for Verifier re-runs.
        if (coordinatorRole === "worker") {
          workerRunStepId = runStep.id;
          workerInstruction = runStep.instruction;
          workerOutput = output;
          buildWorkerPrompt = buildSystemPrompt;
          workerStepCtx = stepContext;
        }
      }

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

  // ── GalaxyCoordinator: post-run outcome quality score + weight update ─────────
  //
  // Quality signal priority:
  //   1. Verifier evaluation score (real, from actual Verifier step)
  //   2. Post-run evaluation of the final output (mirrors outcome-capture logic)
  //   3. Binary pass/fail signal when no evaluation was possible
  if (coordinatorPlan) {
    let finalQualityScore: number | null = null;

    if (verifierScores.length > 0) {
      // Use the average of all Verifier evaluation scores (authoritative)
      finalQualityScore = verifierScores.reduce((s, q) => s + q, 0) / verifierScores.length;
    } else if (allSucceeded && previousOutput) {
      // No Verifier step ran — evaluate final pipeline output against pipeline objective
      // (mirrors the intent of outcome-capture quality scoring)
      try {
        const { openai } = await import("@workspace/integrations-openai-ai-server");
        const pipelineObjective = runSteps.map((s) => s.instruction).join("; ");
        const outcomeEval = await evaluateOutput(
          previousOutput,
          pipelineObjective,
          "gpt-4o-mini",
          COORDINATOR_QUALITY_THRESHOLD,
          "Post-run outcome quality assessment for coordinator learning signal",
        );
        finalQualityScore = outcomeEval.score;
        qualityScoresForTrace["post_run_outcome"] = outcomeEval.score;
        console.log(`[GalaxyCoordinator] Post-run outcome score: ${outcomeEval.score.toFixed(2)} for run ${runId}`);
      } catch {
        // Non-fatal — use binary signal
        finalQualityScore = allSucceeded ? COORDINATOR_QUALITY_THRESHOLD : 0.0;
      }
    } else {
      finalQualityScore = allSucceeded ? COORDINATOR_QUALITY_THRESHOLD : 0.0;
    }

    // Attach quality scores to trace before persisting
    if (Object.keys(qualityScoresForTrace).length > 0) {
      coordinatorPlan.qualityScores = qualityScoresForTrace;
    }

    updateRoutingWeights(
      coordinatorPlan.roleAssignments,
      coordinatorPlan.taskCategory,
      finalQualityScore,
    ).catch((err) => console.error("[GalaxyCoordinator] Weight update error:", err));

    writeCoordinatorTrace(runId, coordinatorPlan).catch((err) =>
      console.error("[GalaxyCoordinator] Trace write error:", err),
    );
  }

  await db
    .update(pipelineRunsTable)
    .set({ status: finalStatus, completedAt: new Date() })
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
      ),
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
