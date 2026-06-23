import type { OpenAI } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAIToolDefinitions, getTool, type ToolContext } from "../tools/registry.js";
import { hashToolCall, isDuplicateToolCall, isStuckOutput } from "../services/ai-safety/loop-detection.js";
import { trimToFitContextWindow } from "../services/ai-safety/context-window.js";
import { callWithFallback } from "../services/ai-safety/model-fallback.js";
import { logLlmUsage } from "../services/analytics/llm-usage.js";
import { checkCostCapAlerts } from "../services/analytics/cost-caps.js";
import { checkToolPermission, createPendingApproval, getResolvedApprovals, ROUTINE_TOOLS, getClientGovernanceMode } from "../services/platform/governance.js";
import { isToolSandboxed, getSandboxedToolResponse } from "../services/platform/demo-sandbox.js";
import {
  Confidence, Cost, Duration,
  Thought, Action, Observation, Evaluation,
  type LoopTrace,
} from "./value-objects/index.js";
import type { AgentLoopConfig, ConfigProvider, FailureCategory, FailureLogStore, LLMProvider, MemoryStore, SessionStore, ToolRegistry } from "./ports/index.js";
import { DEFAULT_LOOP_CONFIG } from "./ports/index.js";
import { DbConfigProvider, DbFailureLogStore, DbSessionStore, logConfidencePrediction, getTemperatureScaleFactor, applyTemperatureScaling } from "./db-adapters.js";
import { resolvePromptWithShadowSplit, recordShadowOutcome } from "../services/platform/jobs/prompt-evolution.js";
import { getTopToolHeuristics } from "../services/platform/jobs/tool-heuristics.js";
import { assignSessionToExperiments } from "../services/platform/jobs/experiment-assignment.js";
import { getClientStyleBeliefs } from "../services/platform/jobs/communication-style.js";
import { isCircuitOpen, recordCircuitFailure, recordCircuitSuccess } from "./circuit-breaker.js";
import { agentMetrics } from "./metrics.js";
import type { AgenticEvent, AgenticLoopResult } from "../tools/agentic-loop.js";
import { emitBotHandoffRequest } from "../services/platform/jobs/bot-handoff.js";

const CIRCUIT_KEY = "llm-primary";

// Module-level defaults (singletons); overridden per-call via AgenticLoopEngineDeps
const defaultConfigProvider = new DbConfigProvider();
const defaultFailureLogStore = new DbFailureLogStore();
const defaultSessionStore = new DbSessionStore();

const idempotencyCache = new Map<string, unknown>();

function makeIdempotencyKey(toolName: string, args: unknown): string {
  return `${toolName}:${JSON.stringify(args)}`;
}

/**
 * Injectable port overrides for AgenticLoopEngine — all fields optional; falls
 * back to DB-backed singletons / OpenAI when omitted.  Pass mocks in tests to
 * fully control every external dependency without hitting the database or network.
 *
 * Providing `llmProvider` wires in any LLMProvider implementation (e.g. GLM52Adapter)
 * in place of the default OpenAI callWithFallback path.
 */
export interface AgenticLoopEngineDeps {
  configProvider?: ConfigProvider;
  failureLogStore?: FailureLogStore;
  sessionStore?: SessionStore;
  /** Optional LLM provider override — injects an alternative model (e.g. GLM52Adapter) */
  llmProvider?: LLMProvider;
  /** Optional tool registry override — routes tool calls through the port instead of the built-in registry */
  toolRegistry?: ToolRegistry;
  /** Optional memory store — loaded before loop start, written after loop end */
  memoryStore?: MemoryStore;
}

export interface AgenticLoopEngineOptions {
  model?: string;
  maxIterations?: number;
  maxTokens?: number;
  tokenBudget?: number;
  systemPrompt: string;
  messages: ChatCompletionMessageParam[];
  context: ToolContext;
  onEvent?: (event: AgenticEvent) => void;
  loopConfig?: Partial<AgentLoopConfig>;
  /** Injectable port implementations (for testing / custom adapters). */
  deps?: AgenticLoopEngineDeps;
}

async function evaluateResponse(
  content: string,
  originalPrompt: string,
  model: string,
  iteration: number,
  threshold: number,
): Promise<Evaluation> {
  const evalPrompt = `You are an AI quality evaluator. Score the following response to the given prompt.

PROMPT: ${originalPrompt.slice(0, 500)}

RESPONSE: ${content.slice(0, 1500)}

Return a JSON object with these fields (all scores 0.0–1.0):
{
  "completeness": <float>,
  "accuracy": <float>,
  "relevance": <float>,
  "critique": "<one sentence critique if score < threshold, else empty string>"
}`;

  try {
    const evalCompletion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a strict JSON-only response quality evaluator. Output only valid JSON." },
        { role: "user", content: evalPrompt },
      ],
      max_completion_tokens: 200,
    });

    const raw = evalCompletion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]) as Record<string, unknown>; } catch { parsed = {}; }
      }
    }

    const completeness = Math.min(1, Math.max(0, Number(parsed.completeness ?? 0.7)));
    const accuracy = Math.min(1, Math.max(0, Number(parsed.accuracy ?? 0.7)));
    const relevance = Math.min(1, Math.max(0, Number(parsed.relevance ?? 0.7)));
    const overallScore = (completeness + accuracy + relevance) / 3;
    const critique = typeof parsed.critique === "string" ? parsed.critique : undefined;

    return new Evaluation({
      completeness,
      accuracy,
      relevance,
      overallScore,
      critique: critique && overallScore < threshold ? critique : undefined,
      passedGate: overallScore >= threshold,
      iteration,
      timestamp: Date.now(),
    });
  } catch {
    return new Evaluation({
      completeness: 0.7,
      accuracy: 0.7,
      relevance: 0.7,
      overallScore: 0.7,
      passedGate: 0.7 >= threshold,
      iteration,
      timestamp: Date.now(),
    });
  }
}

export async function runAgenticLoopEngine(options: AgenticLoopEngineOptions): Promise<AgenticLoopResult> {
  const startMs = Date.now();

  // Resolve injected ports — fall back to module-level singletons
  const resolvedConfigProvider = options.deps?.configProvider ?? defaultConfigProvider;
  const resolvedFailureLogStore = options.deps?.failureLogStore ?? defaultFailureLogStore;
  const resolvedSessionStore = options.deps?.sessionStore ?? defaultSessionStore;

  const {
    model: optModel,
    maxIterations: optMaxIterations,
    maxTokens = 1000,
    tokenBudget = 50_000,
    systemPrompt,
    messages: initialMessages,
    context,
    onEvent,
  } = options;

  const loopConfig = await resolvedConfigProvider.getLoopConfig(
    context.botId ?? 0,
    context.clientId,
  ).catch(() => DEFAULT_LOOP_CONFIG);

  const config: AgentLoopConfig = {
    ...loopConfig,
    ...options.loopConfig,
    maxIterations: optMaxIterations ?? loopConfig.maxIterations,
    model: optModel ?? loopConfig.model,
  };

  const emit = (event: AgenticEvent) => {
    onEvent?.(event);
  };

  async function persistPreLoopOutcome(opts: {
    terminationReason: string;
    failureCategory: FailureCategory;
    finalContent: string;
  }): Promise<void> {
    if (!context.sessionId) return;
    await resolvedSessionStore.updateSessionOutcome(context.sessionId, {
      loopIterations: 0,
      costCents: 0,
      terminationReason: opts.terminationReason,
      failureCategory: opts.failureCategory,
      loopTrace: {
        botId: context.botId,
        clientId: context.clientId,
        sessionId: context.sessionId,
        startedAt: startMs,
        endedAt: Date.now(),
        thoughts: [],
        actions: [],
        observations: [],
        evaluations: [],
        iterationsCompleted: 0,
        totalCostCents: 0,
        terminationReason: opts.terminationReason,
        finalContent: opts.finalContent.slice(0, 500),
      },
    }).catch((e) => console.error("[AgenticLoopEngine] persistPreLoopOutcome failed:", e));
    await resolvedFailureLogStore.logFailure({
      botId: context.botId,
      clientId: context.clientId,
      sessionId: context.sessionId,
      conversationId: context.conversationId,
      failureCategory: opts.failureCategory,
      failureDetail: opts.finalContent.slice(0, 1000),
      iterationsCompleted: 0,
      costCents: 0,
      durationMs: Date.now() - startMs,
      toolsAttempted: [],
    }).catch(() => {});
    agentMetrics.failuresTotal.inc({
      category: opts.failureCategory,
      bot: String(context.botId ?? "unknown"),
    });
  }

  if (isCircuitOpen(CIRCUIT_KEY)) {
    const msg = "AI services are temporarily unavailable due to repeated failures. Auto-reset in ~60 seconds. Please try again shortly.";
    const errEvent: AgenticEvent = { type: "error", content: msg };
    agentMetrics.loopTotal.inc({ termination: "circuit_open", status: "blocked" });
    await persistPreLoopOutcome({ terminationReason: "circuit_open", failureCategory: "circuit_open", finalContent: msg });
    return { finalContent: msg, events: [errEvent] };
  }

  if (context.clientId) {
    try {
      const costCheck = await checkCostCapAlerts(context.clientId);
      if (!costCheck.withinBudget) {
        const msg = `Your monthly AI usage cap has been reached ($${costCheck.spend.toFixed(2)} / $${costCheck.cap.toFixed(2)}). Please contact your administrator to increase the limit.`;
        const errEvent: AgenticEvent = { type: "error", content: msg };
        agentMetrics.loopTotal.inc({ termination: "budget_cap", status: "blocked" });
        await persistPreLoopOutcome({ terminationReason: "budget_cap", failureCategory: "budget_exhaustion", finalContent: msg });
        return { finalContent: msg, events: [errEvent] };
      }
    } catch (err) {
      console.error("[AgenticLoopEngine] Cost cap check failed:", err);
      const msg = "Unable to verify usage limits. Please try again shortly.";
      agentMetrics.loopTotal.inc({ termination: "cost_check_error", status: "error" });
      await persistPreLoopOutcome({ terminationReason: "cost_check_error", failureCategory: "unknown", finalContent: msg });
      return { finalContent: msg, events: [{ type: "error", content: msg }] };
    }
  }

  const events: AgenticEvent[] = [];
  const thoughts: Thought[] = [];
  const actions: Action[] = [];
  const observations: Observation[] = [];
  const evaluations: Evaluation[] = [];

  let totalCost = Cost.zero();
  let cumulativeTokens = 0;
  let terminationReason = "iteration_cap";
  let failureCategory: FailureCategory | undefined;
  let finalContent = "";
  let lastUserPrompt = "";

  for (const msg of initialMessages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      lastUserPrompt = msg.content;
      break;
    }
  }

  // Assign this session to any running experiments at loop start.
  // Returns variant assignments so they can be injected as pipeline tags,
  // enabling downstream filtering of tool calls and outcomes by experiment cohort.
  let experimentTags: Array<{ experimentId: number; cohort: string }> = [];
  try {
    experimentTags = await assignSessionToExperiments({
      sessionId: context.sessionId,
      conversationId: context.conversationId,
    });
  } catch {
    // Non-fatal
  }

  // Resolve active vs shadow prompt — 20% of calls deterministically receive the
  // shadow prompt version (if one exists for this bot) so we can measure its impact
  // against real session outcomes before promoting it to active.
  let resolvedSystemPrompt = systemPrompt;
  let shadowPromptVersionId: number | null = null;
  let servingShadow = false;

  if (context.botId) {
    const shadowResult = await resolvePromptWithShadowSplit({
      botId: context.botId,
      fallbackPrompt: systemPrompt,
      conversationId: context.conversationId,
      sessionId: context.sessionId,
    }).catch(() => ({ prompt: systemPrompt, promptVersionId: null, isShadow: false }));
    resolvedSystemPrompt = shadowResult.prompt;
    shadowPromptVersionId = shadowResult.promptVersionId;
    servingShadow = shadowResult.isShadow;
  }

  const loopMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: resolvedSystemPrompt },
    ...initialMessages,
  ];

  if (context.clientId && context.botId) {
    const resolved = await getResolvedApprovals(
      context.clientId,
      context.botId,
      context.sessionId,
      context.conversationId,
    ).catch(() => []);

    if (resolved.length > 0) {
      const summaries = resolved.map((r) => {
        if (r.status === "approved") {
          return `Tool "${r.toolName}" was APPROVED. Result: ${JSON.stringify(r.toolResult)}`;
        }
        return `Tool "${r.toolName}" was REJECTED. Reason: ${r.rejectionReason || "No reason provided."} Do not retry this action.`;
      });
      loopMessages.push({
        role: "system",
        content: `[Governance Update]\n${summaries.join("\n")}`,
      });
    }
  }

  // Experiment variant pipeline tagging — inject experiment cohort assignments as
  // a system context tag. This allows downstream steps (tool calls, outcome logging,
  // analytics) to filter and segment by experiment variant deterministically.
  if (experimentTags.length > 0) {
    const tagLines = experimentTags.map((t) => `Experiment #${t.experimentId}: cohort ${t.cohort}`);
    loopMessages.push({
      role: "system",
      content: `[Experiment Tags — active A/B variants for this session]\n${tagLines.join("\n")}`,
    });
  }

  // Communication style adaptation — inject learned client style beliefs so every
  // response automatically adapts tone, formality, and detail level to what has
  // historically produced the best outcomes for this client.
  if (context.clientId) {
    const styleBeliefs = await getClientStyleBeliefs(context.clientId).catch(() => []);
    if (styleBeliefs.length > 0) {
      loopMessages.push({
        role: "system",
        content: `[Communication Style — learned from client history]\n${styleBeliefs.map((b) => `- ${b}`).join("\n")}`,
      });
    }
  }

  // Tool heuristics — inject top-3 highest-success-rate tools for this context
  // so the planner can prefer proven tools over untested ones.
  if (context.botId) {
    const contextType = "general";
    const heuristics = await getTopToolHeuristics(contextType, 3).catch(() => []);
    if (heuristics.length > 0) {
      const heuristicLines = heuristics.map(
        (h, i) => `${i + 1}. ${h.toolName} (${(h.successRate * 100).toFixed(0)}% success rate in ${contextType} context)`,
      );
      loopMessages.push({
        role: "system",
        content: `[Tool Heuristics — empirically ranked for this context]\nPrefer these tools when applicable:\n${heuristicLines.join("\n")}`,
      });
    }
  }

  // MemoryStore — retrieve session memories before loop start and inject as context
  const resolvedMemoryStore = options.deps?.memoryStore;
  if (resolvedMemoryStore && context.sessionId) {
    const memEntries = await resolvedMemoryStore.retrieve(context.sessionId).catch(() => []);
    if (memEntries.length > 0) {
      const memContext = memEntries.map((e) => `${e.key}: ${e.value}`).join("\n");
      loopMessages.push({
        role: "system",
        content: `[Memory Context]\n${memContext}`,
      });
    }
  }

  // Belief Context — inject top beliefs ranked by relevance × confidence with
  // phrasing "Based on my last confirmed understanding (confidence: 72%, 18 days ago)…"
  if (context.botId && context.clientId) {
    try {
      const { getBotBeliefContext } = await import("../services/beliefs/context-injector.js");
      const beliefContext = await getBotBeliefContext(context.botId, context.clientId);
      if (beliefContext) {
        loopMessages.push({
          role: "system",
          content: `Based on my last confirmed understanding:\n${beliefContext}`,
        });
      }
    } catch {
      // Non-fatal — belief context is best-effort
    }
  }

  // ToolRegistry port — when injected, its schemas are merged with built-in tools
  const resolvedToolRegistry = options.deps?.toolRegistry;
  const tools = resolvedToolRegistry
    ? resolvedToolRegistry.getSchemas()
    : getOpenAIToolDefinitions();
  const recentToolHashes: string[] = [];
  const recentResponses: string[] = [];
  let retryCount = 0;
  let completedIterations = 0;

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    completedIterations = iteration + 1;
    const elapsed = Duration.since(startMs);
    if (elapsed.exceeds(config.timeBudgetMs)) {
      terminationReason = "time_budget";
      failureCategory = "time_exhaustion";
      const msg = "I've reached the time budget for this task. Here's what I've gathered so far.";
      finalContent = msg;
      const ev: AgenticEvent = { type: "message", content: msg, botId: context.botId, botName: context.botName, iteration };
      events.push(ev); emit(ev);
      break;
    }

    if (totalCost.exceeds(config.costBudgetCents)) {
      terminationReason = "cost_budget";
      failureCategory = "budget_exhaustion";
      const msg = "I've reached the cost budget for this task. Here's what I've gathered so far.";
      finalContent = msg;
      const ev: AgenticEvent = { type: "message", content: msg, botId: context.botId, botName: context.botName, iteration };
      events.push(ev); emit(ev);
      break;
    }

    if (cumulativeTokens >= tokenBudget) {
      terminationReason = "token_budget";
      failureCategory = "budget_exhaustion";
      const msg = "I've reached the token budget for this conversation. Here's what I've gathered so far.";
      finalContent = msg;
      const ev: AgenticEvent = { type: "message", content: msg, botId: context.botId, botName: context.botName, iteration };
      events.push(ev); emit(ev);
      break;
    }

    const trimmed = trimToFitContextWindow(loopMessages, config.model);

    // Normalized completion shape used by both execution paths below
    interface NormalizedCompletion {
      content: string | null;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    }

    let normalized: NormalizedCompletion;
    try {
      if (options.deps?.llmProvider && options.deps.llmProvider.isAvailable()) {
        // ── Injected LLMProvider path (e.g. GLM52Adapter) ──────────────────────
        type PortTools = Parameters<LLMProvider["complete"]>[0]["tools"];
        const portResult = await options.deps.llmProvider.complete({
          model: config.model,
          messages: trimmed as Parameters<LLMProvider["complete"]>[0]["messages"],
          maxTokens,
          tools: tools.length > 0 ? tools as unknown as PortTools : undefined,
          clientId: context.clientId,
          botId: context.botId,
          sessionId: context.sessionId ? Number(context.sessionId) : undefined,
          conversationId: context.conversationId ? Number(context.conversationId) : undefined,
        });
        cumulativeTokens += portResult.promptTokens + portResult.completionTokens;
        totalCost = totalCost.add(Cost.ofCents(portResult.costCents));
        normalized = { content: portResult.content, tool_calls: portResult.tool_calls };
      } else {
        // ── Default OpenAI / callWithFallback path ─────────────────────────────
        const result = await callWithFallback({
          model: config.model,
          messages: trimmed,
          maxCompletionTokens: maxTokens,
          tools: tools.length > 0 ? tools : undefined,
          clientId: context.clientId,
          botId: context.botId,
          sessionId: context.sessionId ? Number(context.sessionId) : undefined,
          conversationId: context.conversationId ? Number(context.conversationId) : undefined,
        });
        const completion = result.completion;
        const usage = completion.usage;
        if (usage) {
          cumulativeTokens += (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
          const costCents = Math.ceil(((usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)) / 1000 * 0.15);
          totalCost = totalCost.add(Cost.ofCents(costCents));
        }
        const choice = completion.choices[0];
        normalized = {
          content: choice?.message?.content ?? null,
          tool_calls: choice?.message?.tool_calls as typeof normalized.tool_calls,
        };
      }
      recordCircuitSuccess(CIRCUIT_KEY);
    } catch (err) {
      recordCircuitFailure(CIRCUIT_KEY);
      failureCategory = isCircuitOpen(CIRCUIT_KEY) ? "circuit_open" : "reasoning_failure";
      const errMsg = err instanceof Error ? err.message : "Model call failed";
      const degraded = errMsg.includes("All models") || errMsg.includes("temporarily")
        ? "I'm experiencing difficulty connecting to AI services. Please try again in a few moments."
        : errMsg;
      terminationReason = "llm_error";
      finalContent = degraded;
      const errEv: AgenticEvent = { type: "error", content: degraded, iteration };
      events.push(errEv); emit(errEv);

      agentMetrics.loopTotal.inc({ termination: "llm_error", status: "error" });
      await persistFailure({
        context, thoughts, actions, observations, totalCost,
        startMs, iteration, terminationReason, failureCategory,
        lastUserPrompt, lastThought: thoughts[thoughts.length - 1]?.content,
        failureDetail: degraded,
        failureLogStore: resolvedFailureLogStore,
        sessionStore: resolvedSessionStore,
      });
      return { finalContent: degraded, events, totalTokensConsumed: cumulativeTokens };
    }

    if (!normalized.content && (!normalized.tool_calls || normalized.tool_calls.length === 0)) {
      terminationReason = "no_response";
      failureCategory = "reasoning_failure";
      break;
    }

    const assistantContent = normalized.content ?? "";

    if (assistantContent) {
      const thought = Thought.create(assistantContent, iteration);
      thoughts.push(thought);

      if (isStuckOutput(assistantContent, recentResponses)) {
        terminationReason = "stuck_output";
        const best = recentResponses[0] || assistantContent;
        finalContent = best;
        const msgEv: AgenticEvent = { type: "message", content: best, botId: context.botId, botName: context.botName, iteration };
        const doneEv: AgenticEvent = { type: "bot_complete", botId: context.botId, botName: context.botName, iteration };
        events.push(msgEv, doneEv); emit(msgEv); emit(doneEv);
        break;
      }
      recentResponses.push(assistantContent);
      if (recentResponses.length > 3) recentResponses.shift();
    }

    if (!normalized.tool_calls || normalized.tool_calls.length === 0) {
      if (config.enableSelfEvaluation && assistantContent && retryCount < 2) {
        const evaluation = await evaluateResponse(
          assistantContent,
          lastUserPrompt,
          config.model,
          iteration,
          config.qualityThreshold,
        );
        evaluations.push(evaluation);

        // Apply temperature scaling to the raw confidence score so that
        // calibrated confidence drives gate decisions and downstream logging.
        const tempScale = await getTemperatureScaleFactor(context.botId).catch(() => 1.0);
        const calibratedScore = applyTemperatureScaling(evaluation.overallScore, tempScale);
        const calibratedPassedGate = calibratedScore >= (config.qualityThreshold ?? 0.7);

        agentMetrics.selfEvaluationScore.observe(calibratedScore, {
          bot: String(context.botId ?? "unknown"),
        });

        await logConfidencePrediction({
          sessionId: context.sessionId,
          conversationId: context.conversationId,
          botId: context.botId,
          clientId: context.clientId,
          iteration,
          predictedConfidence: evaluation.overallScore,  // raw score stored immutably
          completenessScore: evaluation.completeness,
          accuracyScore: evaluation.accuracy,
          relevanceScore: evaluation.relevance,
          terminationReason: calibratedPassedGate ? "quality_gate_pass" : "quality_gate_retry",
        }).catch(() => {});

        if (!calibratedPassedGate && evaluation.critique) {
          retryCount++;
          agentMetrics.qualityGateRetries.inc({ bot: String(context.botId ?? "unknown") });
          console.log(`[AgenticLoopEngine] Quality gate failed (${(evaluation.overallScore * 100).toFixed(0)}%), retrying with critique (attempt ${retryCount})`);

          loopMessages.push({
            role: "assistant",
            content: assistantContent,
          });
          loopMessages.push({
            role: "user",
            content: `[Quality Gate Critique] Your previous response scored ${(evaluation.overallScore * 100).toFixed(0)}%. Issues: ${evaluation.critique} Please improve your response addressing these issues.`,
          });
          continue;
        }
      }

      terminationReason = "natural_completion";
      finalContent = assistantContent;

      const msgEv: AgenticEvent = { type: "message", content: assistantContent, botId: context.botId, botName: context.botName, iteration };
      const doneEv: AgenticEvent = { type: "bot_complete", botId: context.botId, botName: context.botName, iteration };
      events.push(msgEv, doneEv); emit(msgEv); emit(doneEv);

      agentMetrics.loopTotal.inc({ termination: "natural_completion", status: "success" });
      agentMetrics.loopDurationMs.observe(Duration.since(startMs).ms, { bot: String(context.botId ?? "unknown") });
      agentMetrics.loopCostCents.observe(totalCost.cents, { bot: String(context.botId ?? "unknown") });
      agentMetrics.loopIterations.observe(iteration + 1, { bot: String(context.botId ?? "unknown") });

      await persistTrace({
        context, thoughts, actions, observations, evaluations,
        totalCost, startMs, iteration: iteration + 1,
        terminationReason, finalContent,
        sessionStore: resolvedSessionStore,
      });
      if (resolvedMemoryStore && context.sessionId && finalContent) {
        await resolvedMemoryStore.store(context.sessionId as number, [
          { key: "last_response", value: finalContent.slice(0, 1000) },
        ]).catch(() => {});
      }
      return { finalContent, events, totalTokensConsumed: cumulativeTokens };
    }

    if (context.clientId && context.botId) {
      const governanceMode = await getClientGovernanceMode(context.clientId).catch(() => "observe_only");

      for (const toolCall of normalized.tool_calls!) {
        const toolName = toolCall.function.name;
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(toolCall.function.arguments); } catch { parsedArgs = {}; }

        const permCheck = await checkToolPermission(context.clientId, context.botId, toolName).catch(() => ({ allowed: true, requiresApproval: false }));
        const isRoutine = ROUTINE_TOOLS.includes(toolName);
        const needsApproval =
          permCheck.requiresApproval &&
          !(governanceMode === "exception_only" && isRoutine) &&
          !(governanceMode === "observe_only");

        if (needsApproval) {
          loopMessages.push({
            role: "assistant",
            content: normalized.content,
            tool_calls: normalized.tool_calls as OpenAI.ChatCompletionMessageToolCall[],
          });

          const approvalId = await createPendingApproval({
            clientId: context.clientId,
            botId: context.botId,
            botName: context.botName,
            toolName,
            toolInput: parsedArgs,
            sessionId: context.sessionId,
            conversationId: context.conversationId,
            pausedLoopContext: {
              model: config.model,
              maxIterations: config.maxIterations,
              maxTokens,
              systemPrompt,
              messages: loopMessages,
              remainingIterations: config.maxIterations - iteration - 1,
              toolCallId: toolCall.id,
              allToolCallIds: normalized.tool_calls!.map((tc) => tc.id),
            },
          });

          const approvalEv: AgenticEvent = {
            type: "tool_pending_approval",
            toolName,
            toolCallId: toolCall.id,
            approvalId,
            content: `Tool "${toolName}" requires owner approval. Approval request #${approvalId} created.`,
            botId: context.botId,
            botName: context.botName,
            iteration,
          };
          const pauseMsg = `I attempted to use "${toolName}" but this requires owner approval. Request #${approvalId} has been created.`;
          const pauseEv: AgenticEvent = { type: "message", content: pauseMsg, botId: context.botId, botName: context.botName, iteration };
          events.push(approvalEv, pauseEv); emit(approvalEv); emit(pauseEv);

          // Persist partial trace so paused sessions are trackable in session_outcomes
          await persistTrace({
            context, thoughts, actions, observations, evaluations,
            totalCost, startMs, iteration: iteration + 1,
            terminationReason: "pending_approval",
            finalContent: pauseMsg,
            sessionStore: resolvedSessionStore,
          });

          return { finalContent: pauseMsg, events, paused: true, pendingApprovalId: approvalId, pausedToolName: toolName, totalTokensConsumed: cumulativeTokens };
        }
      }
    }

    loopMessages.push({
      role: "assistant",
      content: normalized.content,
      tool_calls: normalized.tool_calls as OpenAI.ChatCompletionMessageToolCall[],
    });

    const toolResults = await Promise.all(
      normalized.tool_calls!.map(async (toolCall) => {
        const toolName = toolCall.function.name;
        let parsedArgs: Record<string, unknown>;
        try { parsedArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>; } catch { parsedArgs = {}; }

        const idempKey = makeIdempotencyKey(toolName, parsedArgs);
        const callHash = hashToolCall(toolName, parsedArgs);

        if (isDuplicateToolCall(callHash, recentToolHashes)) {
          const skipResult = { skipped: true, message: `Tool "${toolName}" was already called with identical parameters.` };
          const skipEv: AgenticEvent = { type: "tool_result", toolName, toolCallId: toolCall.id, input: parsedArgs, output: skipResult, botId: context.botId, botName: context.botName, iteration };
          events.push(skipEv); emit(skipEv);
          return { toolCallId: toolCall.id, result: skipResult };
        }
        recentToolHashes.push(callHash);
        if (recentToolHashes.length > 5) recentToolHashes.shift();

        const callEv: AgenticEvent = { type: "tool_call", toolName, toolCallId: toolCall.id, input: parsedArgs, botId: context.botId, botName: context.botName, iteration };
        events.push(callEv); emit(callEv);
        agentMetrics.toolCallsTotal.inc({ tool: toolName, status: "started" });

        const action = Action.create(toolName, toolCall.id, parsedArgs, iteration);
        actions.push(action);

        const toolStart = Date.now();
        let result: unknown;
        let toolError: string | undefined;

        if (context.isGuest && isToolSandboxed(toolName)) {
          result = getSandboxedToolResponse(toolName);
        } else if (resolvedToolRegistry) {
          // ── Injected ToolRegistry path ──────────────────────────────────────
          try {
            const portOut = await resolvedToolRegistry.execute(
              toolName,
              parsedArgs,
              context as unknown as Record<string, unknown>,
            );
            result = portOut.error ? { error: portOut.error } : portOut.result;
            toolError = portOut.error;
          } catch (e) {
            const errObj = { error: e instanceof Error ? e.message : "Tool execution failed" };
            result = errObj;
            toolError = errObj.error;
          }
        } else {
          // ── Built-in registry path ──────────────────────────────────────────
          const tool = getTool(toolName);
          if (!tool) {
            result = { error: `Unknown tool: ${toolName}` };
            toolError = `Unknown tool: ${toolName}`;
          } else if (context.clientId && context.botId) {
            const permCheck = await checkToolPermission(context.clientId, context.botId, toolName).catch(() => ({ allowed: true }));
            if (!permCheck.allowed) {
              result = { error: `Permission denied: ${(permCheck as { reason?: string }).reason || "Not allowed"}` };
              toolError = "permission_denied";
              const blockedEv: AgenticEvent = { type: "tool_blocked", toolName, toolCallId: toolCall.id, content: toolError, botId: context.botId, botName: context.botName, iteration };
              events.push(blockedEv); emit(blockedEv);
            } else {
              try {
                const validated = tool.inputSchema.safeParse(parsedArgs);
                result = validated.success ? await tool.execute(validated.data, context) : { error: `Invalid input: ${validated.error?.message}` };
              } catch (e) {
                const errObj = { error: e instanceof Error ? e.message : "Tool execution failed" };
                result = errObj;
                toolError = errObj.error;
              }
            }
          } else {
            try {
              const validated = tool.inputSchema.safeParse(parsedArgs);
              result = validated.success ? await tool.execute(validated.data, context) : { error: `Invalid input: ${validated.error?.message}` };
            } catch (e) {
              const errObj = { error: e instanceof Error ? e.message : "Tool execution failed" };
              result = errObj;
              toolError = errObj.error;
            }
          }
        }

        const toolDurationMs = Date.now() - toolStart;
        const obs = new Observation({
          toolName,
          toolCallId: toolCall.id,
          result,
          error: toolError,
          durationMs: toolDurationMs,
          iteration,
          timestamp: Date.now(),
        });
        observations.push(obs);

        const isError = typeof result === "object" && result !== null && "error" in (result as Record<string, unknown>);
        agentMetrics.toolCallsTotal.inc({ tool: toolName, status: isError ? "error" : "success" });

        const resultEv: AgenticEvent = { type: "tool_result", toolName, toolCallId: toolCall.id, input: parsedArgs, output: result, botId: context.botId, botName: context.botName, iteration };
        events.push(resultEv); emit(resultEv);

        return { toolCallId: toolCall.id, result };
      })
    );

    for (const { toolCallId, result } of toolResults) {
      loopMessages.push({ role: "tool", tool_call_id: toolCallId, content: JSON.stringify(result) });
    }
  }

  if (!finalContent) {
    finalContent = "I've reached the maximum number of processing steps. Here's what I've gathered so far.";
    const fallbackEv: AgenticEvent = { type: "message", content: finalContent, botId: context.botId, botName: context.botName };
    const doneEv: AgenticEvent = { type: "bot_complete", botId: context.botId, botName: context.botName };
    events.push(fallbackEv, doneEv); emit(fallbackEv); emit(doneEv);
  }

  const isFailure = ["time_budget", "cost_budget", "token_budget", "llm_error", "reasoning_failure", "circuit_open"].includes(terminationReason);
  agentMetrics.loopTotal.inc({ termination: terminationReason, status: isFailure ? "error" : "success" });
  agentMetrics.loopDurationMs.observe(Duration.since(startMs).ms, { bot: String(context.botId ?? "unknown") });
  agentMetrics.loopCostCents.observe(totalCost.cents, { bot: String(context.botId ?? "unknown") });
  agentMetrics.loopIterations.observe(completedIterations, { bot: String(context.botId ?? "unknown") });

  if (isFailure && failureCategory) {
    await persistFailure({
      context, thoughts, actions, observations, totalCost,
      startMs, iteration: completedIterations, terminationReason, failureCategory,
      lastUserPrompt, lastThought: thoughts[thoughts.length - 1]?.content,
      failureDetail: finalContent,
      failureLogStore: resolvedFailureLogStore,
      sessionStore: resolvedSessionStore,
    });
  } else {
    await persistTrace({
      context, thoughts, actions, observations, evaluations,
      totalCost, startMs, iteration: completedIterations,
      terminationReason, finalContent,
      sessionStore: resolvedSessionStore,
    });
  }

  // Shadow prompt outcome recording — track BOTH shadow and control arms concurrently
  // so the promotion job compares live cohorts rather than a stale static baseline.
  // When serving the shadow prompt (20% of sessions), tag succeeded=true/false for the shadow arm.
  // When serving the active/control prompt (80%), tag the control arm on the same shadow version
  // so concurrent A/B rates are available at promotion time.
  if (shadowPromptVersionId !== null) {
    recordShadowOutcome({
      promptVersionId: shadowPromptVersionId,
      succeeded: !isFailure,
      isShadow: servingShadow,
    }).catch(() => {});
  }

  // MemoryStore — write the final response as a memory entry for future sessions
  if (resolvedMemoryStore && context.sessionId && finalContent && !isFailure) {
    await resolvedMemoryStore.store(context.sessionId, [
      { key: "last_response", value: finalContent.slice(0, 1000) },
    ]).catch(() => {});
  }

  // Cross-bot handoff: automatically emit a handoff request when termination indicates a
  // capability gap (information_gap or tool_limitation) so a specialist bot can continue.
  if (
    (terminationReason === "information_gap" || terminationReason === "tool_limitation") &&
    context.botId &&
    context.clientId
  ) {
    emitBotHandoffRequest({
      sourceBotId: context.botId,
      clientId: context.clientId,
      sessionId: context.sessionId,
      assignmentId: undefined,
      reason: `Loop terminated due to ${terminationReason}: ${finalContent?.slice(0, 200) ?? ""}`,
      terminationReason,
      context: { thoughts: thoughts.length, actions: actions.length, finalContent: finalContent?.slice(0, 500) },
    }).catch((err) =>
      console.error(`[loop] emitBotHandoffRequest error (${terminationReason}):`, err),
    );
  }

  return { finalContent, events, totalTokensConsumed: cumulativeTokens };
}

async function persistTrace(opts: {
  context: ToolContext;
  thoughts: Thought[];
  actions: Action[];
  observations: Observation[];
  evaluations: Evaluation[];
  totalCost: Cost;
  startMs: number;
  iteration: number;
  terminationReason: string;
  finalContent: string;
  sessionStore: SessionStore;
}): Promise<void> {
  const trace: LoopTrace = {
    botId: opts.context.botId,
    botName: opts.context.botName,
    clientId: opts.context.clientId,
    sessionId: opts.context.sessionId,
    conversationId: opts.context.conversationId,
    startedAt: opts.startMs,
    endedAt: Date.now(),
    thoughts: opts.thoughts.map((t) => t.toJSON()),
    actions: opts.actions.map((a) => a.toJSON()),
    observations: opts.observations.map((o) => o.toJSON()),
    evaluations: opts.evaluations.map((e) => e.toJSON()),
    iterationsCompleted: opts.iteration,
    totalCostCents: opts.totalCost.cents,
    terminationReason: opts.terminationReason,
    finalContent: opts.finalContent.slice(0, 500),
  };

  if (opts.context.sessionId) {
    await opts.sessionStore.updateSessionOutcome(opts.context.sessionId, {
      loopIterations: opts.iteration,
      costCents: opts.totalCost.cents,
      terminationReason: opts.terminationReason,
      loopTrace: trace as unknown as Record<string, unknown>,
    }).catch((e) => console.error("[AgenticLoopEngine] persistTrace failed:", e));
  }
}

async function persistFailure(opts: {
  context: ToolContext;
  thoughts: Thought[];
  actions: Action[];
  observations: Observation[];
  totalCost: Cost;
  startMs: number;
  iteration: number;
  terminationReason: string;
  failureCategory: FailureCategory;
  lastUserPrompt: string;
  lastThought?: string;
  failureDetail: string;
  failureLogStore: FailureLogStore;
  sessionStore: SessionStore;
}): Promise<void> {
  const trace: Partial<LoopTrace> = {
    thoughts: opts.thoughts.map((t) => t.toJSON()),
    actions: opts.actions.map((a) => a.toJSON()),
    observations: opts.observations.slice(-5).map((o) => o.toJSON()),
    iterationsCompleted: opts.iteration,
    totalCostCents: opts.totalCost.cents,
    terminationReason: opts.terminationReason,
  };

  await opts.failureLogStore.logFailure({
    botId: opts.context.botId,
    clientId: opts.context.clientId,
    sessionId: opts.context.sessionId,
    conversationId: opts.context.conversationId,
    failureCategory: opts.failureCategory,
    failureDetail: opts.failureDetail.slice(0, 1000),
    userInput: opts.lastUserPrompt.slice(0, 500),
    lastThought: opts.lastThought?.slice(0, 500),
    iterationsCompleted: opts.iteration,
    costCents: opts.totalCost.cents,
    durationMs: Date.now() - opts.startMs,
    toolsAttempted: opts.actions.map((a) => a.toolName),
    traceSnapshot: trace as Record<string, unknown>,
  }).catch((e) => console.error("[AgenticLoopEngine] persistFailure failed:", e));

  agentMetrics.failuresTotal.inc({
    category: opts.failureCategory,
    bot: String(opts.context.botId ?? "unknown"),
  });

  if (opts.context.sessionId) {
    await opts.sessionStore.updateSessionOutcome(opts.context.sessionId, {
      loopIterations: opts.iteration,
      costCents: opts.totalCost.cents,
      terminationReason: opts.terminationReason,
      failureCategory: opts.failureCategory,
      loopTrace: trace as Record<string, unknown>,
    }).catch(() => {});
  }
}
