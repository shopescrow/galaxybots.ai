import type { OpenAI } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;
import { openai } from "@workspace/integrations-openai-ai-server";
import { isRateLimitError } from "@workspace/integrations-openai-ai-server";
import { getTool, getOpenAIToolDefinitions, type ToolContext } from "./registry";
import { db, platformAuditLogTable } from "@workspace/db";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";
import { checkToolPermission, createPendingApproval, getResolvedApprovals, ROUTINE_TOOLS, getClientGovernanceMode } from "../services/platform/governance";
import { logLlmUsage } from "../services/analytics/llm-usage";
import { isToolSandboxed, getSandboxedToolResponse } from "../services/platform/demo-sandbox";
import { checkCostCapAlerts } from "../services/analytics/cost-caps";
import {
  hashToolCall,
  isDuplicateToolCall,
  isStuckOutput,
  checkSessionDepth,
} from "../services/ai-safety/loop-detection";
import {
  estimateMessagesTokens,
  trimToFitContextWindow,
} from "../services/ai-safety/context-window";
import { callWithFallback } from "../services/ai-safety/model-fallback";
import { runAgenticLoopEngine } from "../agent-core/agentic-loop-engine";

const DEFAULT_TOKEN_BUDGET = 50_000;
const DEFAULT_GUEST_CALL_LIMIT = 20;

const guestCallCounts = new Map<string, number>();

function auditToolExecution(
  context: ToolContext,
  toolName: string,
  success: boolean,
) {
  if (!context.clientId) return;
  db.insert(platformAuditLogTable)
    .values({
      clientId: context.clientId,
      userId: context.userId ?? null,
      action: "tool_execution",
      resource: "tool",
      resourceId: toolName,
      metadata: {
        toolName,
        success,
        sessionId: context.sessionId,
        botId: context.botId,
        botName: context.botName,
      },
      ipAddress: null,
    })
    .catch((err: unknown) => {
      console.error("Tool audit log write failed:", err);
    });
}

export interface AgenticEvent {
  type: "tool_call" | "tool_result" | "message" | "bot_complete" | "error" | "done" | "tool_blocked" | "tool_pending_approval" | "moa_progress" | "moa_synthesizing" | "conductor_strategy" | "conductor_progress" | "conductor_synthesizing";
  botId?: number;
  botName?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  content?: string;
  iteration?: number;
  approvalId?: number;
  [key: string]: unknown;
}

export interface AgenticLoopOptions {
  model?: string;
  maxIterations?: number;
  maxTokens?: number;
  tokenBudget?: number;
  systemPrompt: string;
  messages: ChatCompletionMessageParam[];
  context: ToolContext;
  onEvent?: (event: AgenticEvent) => void;
}

const toolLimit = pLimit(3);

async function executeToolWithRetry(
  tool: ReturnType<typeof getTool> & {},
  parsedArgs: unknown,
  context: ToolContext,
): Promise<unknown> {
  try {
    return await pRetry(
      async () => {
        const validated = tool.inputSchema.safeParse(parsedArgs);
        if (!validated.success) {
          throw new AbortError(
            new Error(`Invalid input: ${validated.error.message}`)
          );
        }
        const output = await tool.execute(validated.data, context);
        if (tool.outputSchema) {
          const outputValidated = tool.outputSchema.safeParse(output);
          if (!outputValidated.success) {
            throw new AbortError(
              new Error(`Tool output validation failed: ${outputValidated.error.message}`)
            );
          }
          return outputValidated.data;
        }
        return output;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 10000,
        factor: 2,
        onFailedAttempt: (error) => {
          if (!isRateLimitError(error)) {
            throw new AbortError(
              error instanceof Error ? error : new Error(String(error))
            );
          }
        },
      }
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

export interface AgenticLoopResult {
  finalContent: string;
  events: AgenticEvent[];
  paused?: boolean;
  pendingApprovalId?: number;
  pausedToolName?: string;
  totalTokensConsumed?: number;
}

export async function runAgenticLoop(options: AgenticLoopOptions): Promise<AgenticLoopResult> {
  const {
    model = "gpt-5-mini",
    maxIterations = 10,
    maxTokens = 1000,
    tokenBudget = DEFAULT_TOKEN_BUDGET,
    systemPrompt,
    messages: initialMessages,
    context,
    onEvent,
  } = options;

  if (context.depth !== undefined) {
    const depthCheck = checkSessionDepth(context.depth);
    if (!depthCheck.allowed) {
      const errorEvent: AgenticEvent = {
        type: "error",
        content: depthCheck.message,
      };
      return { finalContent: depthCheck.message!, events: [errorEvent] };
    }
  }

  if (context.clientId) {
    try {
      const costCheck = await checkCostCapAlerts(context.clientId);
      if (!costCheck.withinBudget) {
        const msg = `Your monthly AI usage cap has been reached ($${costCheck.spend.toFixed(2)} / $${costCheck.cap.toFixed(2)}). Please contact your administrator to increase the limit or wait until the next billing cycle.`;
        const errorEvent: AgenticEvent = { type: "error", content: msg };
        return { finalContent: msg, events: [errorEvent] };
      }
    } catch (err) {
      console.error("[AgenticLoop] Cost cap check failed, blocking request (fail-closed):", err);
      const msg = "Unable to verify usage limits. Please try again shortly.";
      const errorEvent: AgenticEvent = { type: "error", content: msg };
      return { finalContent: msg, events: [errorEvent] };
    }
  }

  if (context.isGuest) {
    const guestKey = context.guestSessionToken || `guest-bot-${context.botId ?? "unknown"}`;
    const currentCount = guestCallCounts.get(guestKey) ?? 0;
    if (currentCount >= DEFAULT_GUEST_CALL_LIMIT) {
      const msg = "You've reached the maximum number of AI interactions for this demo session. Please sign up for a full account to continue.";
      const errorEvent: AgenticEvent = { type: "error", content: msg };
      return { finalContent: msg, events: [errorEvent] };
    }
    guestCallCounts.set(guestKey, currentCount + 1);
  }

  // Delegate to AgenticLoopEngine — the full PARO state machine with quality gate,
  // self-evaluation, LoopTrace persistence, calibration tracking, and circuit breaker.
  // Pre-loop guards (depth, cost cap, guest limit) are handled above.
  return runAgenticLoopEngine({ model, maxIterations, maxTokens, tokenBudget, systemPrompt, messages: initialMessages, context, onEvent });
}

function addToolResponses(
  loopMessages: ChatCompletionMessageParam[],
  pausedCtx: { toolCallId: string; allToolCallIds?: string[] },
  primaryResult: string,
) {
  const allIds = pausedCtx.allToolCallIds || [pausedCtx.toolCallId];
  for (const callId of allIds) {
    if (callId === pausedCtx.toolCallId) {
      loopMessages.push({ role: "tool", tool_call_id: callId, content: primaryResult });
    } else {
      loopMessages.push({
        role: "tool",
        tool_call_id: callId,
        content: JSON.stringify({ error: "Execution paused due to approval gate on a sibling tool call. This tool was not executed." }),
      });
    }
  }
}

export async function resumeAgenticLoop(options: {
  pausedLoopContext: {
    model: string;
    maxIterations: number;
    maxTokens: number;
    systemPrompt: string;
    messages: unknown[];
    remainingIterations: number;
    toolCallId: string;
    allToolCallIds?: string[];
  };
  toolResult: unknown;
  context: ToolContext;
  onEvent?: (event: AgenticEvent) => void;
}): Promise<AgenticLoopResult> {
  const { pausedLoopContext, toolResult, context, onEvent } = options;

  const loopMessages: ChatCompletionMessageParam[] =
    pausedLoopContext.messages as ChatCompletionMessageParam[];

  addToolResponses(loopMessages, pausedLoopContext, JSON.stringify(toolResult));

  return runAgenticLoop({
    model: pausedLoopContext.model,
    maxIterations: Math.max(pausedLoopContext.remainingIterations, 1),
    maxTokens: pausedLoopContext.maxTokens,
    systemPrompt: pausedLoopContext.systemPrompt,
    messages: loopMessages.slice(1),
    context,
    onEvent,
  });
}

export async function resumeAgenticLoopWithRejection(options: {
  pausedLoopContext: {
    model: string;
    maxIterations: number;
    maxTokens: number;
    systemPrompt: string;
    messages: unknown[];
    remainingIterations: number;
    toolCallId: string;
    allToolCallIds?: string[];
  };
  toolName: string;
  rejectionReason: string;
  context: ToolContext;
  onEvent?: (event: AgenticEvent) => void;
}): Promise<AgenticLoopResult> {
  const { pausedLoopContext, toolName, rejectionReason, context, onEvent } = options;

  const loopMessages: ChatCompletionMessageParam[] =
    pausedLoopContext.messages as ChatCompletionMessageParam[];

  addToolResponses(
    loopMessages,
    pausedLoopContext,
    JSON.stringify({
      error: `Action rejected by owner: ${rejectionReason}. Tool "${toolName}" was not executed. Please adapt your approach and do not retry this action.`,
    }),
  );

  return runAgenticLoop({
    model: pausedLoopContext.model,
    maxIterations: Math.max(pausedLoopContext.remainingIterations, 1),
    maxTokens: pausedLoopContext.maxTokens,
    systemPrompt: pausedLoopContext.systemPrompt,
    messages: loopMessages.slice(1),
    context,
    onEvent,
  });
}
