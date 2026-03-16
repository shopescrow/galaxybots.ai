import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { openai } from "@workspace/integrations-openai-ai-server";
import { isRateLimitError } from "@workspace/integrations-openai-ai-server";
import { getTool, getOpenAIToolDefinitions, type ToolContext } from "./registry";
import { db, platformAuditLogTable } from "@workspace/db";
import pLimit from "p-limit";
import pRetry from "p-retry";
import { checkToolPermission, createPendingApproval, getResolvedApprovals } from "../services/governance";
import { logLlmUsage } from "../services/llm-usage";

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
  type: "tool_call" | "tool_result" | "message" | "bot_complete" | "error" | "done" | "tool_blocked" | "tool_pending_approval";
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
          throw new pRetry.AbortError(
            new Error(`Invalid input: ${validated.error.message}`)
          );
        }
        const output = await tool.execute(validated.data, context);
        if (tool.outputSchema) {
          const outputValidated = tool.outputSchema.safeParse(output);
          if (!outputValidated.success) {
            throw new pRetry.AbortError(
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
            throw new pRetry.AbortError(
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
}

export async function runAgenticLoop(options: AgenticLoopOptions): Promise<AgenticLoopResult> {
  const {
    model = "gpt-4o-mini",
    maxIterations = 10,
    maxTokens = 1000,
    systemPrompt,
    messages: initialMessages,
    context,
    onEvent,
  } = options;

  const events: AgenticEvent[] = [];
  const loopMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...initialMessages,
  ];

  if (context.clientId && context.botId) {
    const resolved = await getResolvedApprovals(
      context.clientId,
      context.botId,
      context.sessionId,
      context.conversationId
    );
    if (resolved.length > 0) {
      const summaries = resolved.map((r) => {
        if (r.status === "approved") {
          return `Previously requested tool "${r.toolName}" was APPROVED by the owner. Result: ${JSON.stringify(r.toolResult)}`;
        }
        return `Previously requested tool "${r.toolName}" was REJECTED by the owner. Reason: ${r.rejectionReason || "No reason provided."}. You should adapt your approach and not attempt this action again.`;
      });
      loopMessages.push({
        role: "system",
        content: `[Governance Update] The following approval decisions have been made:\n${summaries.join("\n")}`,
      });
    }
  }

  const tools = getOpenAIToolDefinitions();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let completion;
    const callStart = Date.now();
    try {
      completion = await pRetry(
        () =>
          openai.chat.completions.create({
            model,
            max_completion_tokens: maxTokens,
            messages: loopMessages,
            ...(tools.length > 0 ? { tools } : {}),
          }),
        {
          retries: 5,
          minTimeout: 1000,
          maxTimeout: 15000,
          factor: 2,
          onFailedAttempt: (error) => {
            if (!isRateLimitError(error)) {
              throw new pRetry.AbortError(
                error instanceof Error ? error : new Error(String(error))
              );
            }
          },
        }
      );
      const latencyMs = Date.now() - callStart;
      const usage = completion.usage;
      if (usage) {
        logLlmUsage({
          clientId: context.clientId,
          botId: context.botId,
          sessionId: context.sessionId ? Number(context.sessionId) : null,
          conversationId: context.conversationId ? Number(context.conversationId) : null,
          model,
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          latencyMs,
        });
      }
    } catch (err) {
      const errorEvent: AgenticEvent = {
        type: "error",
        content: err instanceof Error ? err.message : "Model call failed after retries",
        iteration,
      };
      events.push(errorEvent);
      onEvent?.(errorEvent);
      break;
    }

    const choice = completion.choices[0];
    if (!choice) {
      const errorEvent: AgenticEvent = { type: "error", content: "No response from model", iteration };
      events.push(errorEvent);
      onEvent?.(errorEvent);
      break;
    }

    const assistantMessage = choice.message;

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      const finalContent = assistantMessage.content ?? "";
      const msgEvent: AgenticEvent = {
        type: "message",
        content: finalContent,
        botId: context.botId,
        botName: context.botName,
        iteration,
      };
      events.push(msgEvent);
      onEvent?.(msgEvent);

      const completeEvent: AgenticEvent = { type: "bot_complete", botId: context.botId, botName: context.botName, iteration };
      events.push(completeEvent);
      onEvent?.(completeEvent);

      return { finalContent, events };
    }

    if (context.clientId && context.botId) {
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let parsedArgs: unknown;
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          parsedArgs = {};
        }

        const permCheck = await checkToolPermission(context.clientId, context.botId, toolName);

        if (permCheck.requiresApproval) {
          loopMessages.push({
            role: "assistant",
            content: assistantMessage.content,
            tool_calls: assistantMessage.tool_calls,
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
              model,
              maxIterations,
              maxTokens,
              systemPrompt,
              messages: loopMessages,
              remainingIterations: maxIterations - iteration - 1,
              toolCallId: toolCall.id,
              allToolCallIds: assistantMessage.tool_calls.map((tc) => tc.id),
            },
          });

          const approvalEvent: AgenticEvent = {
            type: "tool_pending_approval",
            toolName,
            toolCallId: toolCall.id,
            approvalId,
            content: `Tool "${toolName}" requires owner approval before execution. The entire turn has been paused. Approval request #${approvalId} created.`,
            botId: context.botId,
            botName: context.botName,
            iteration,
          };
          events.push(approvalEvent);
          onEvent?.(approvalEvent);

          const pausedContent = `I attempted to use "${toolName}" but this action requires owner approval before I can proceed. Approval request #${approvalId} has been created. Once approved, the action will be executed and my workflow will resume.`;
          const pauseMsg: AgenticEvent = {
            type: "message",
            content: pausedContent,
            botId: context.botId,
            botName: context.botName,
            iteration,
          };
          events.push(pauseMsg);
          onEvent?.(pauseMsg);

          return {
            finalContent: pausedContent,
            events,
            paused: true,
            pendingApprovalId: approvalId,
            pausedToolName: toolName,
          };
        }
      }
    }

    loopMessages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
    });

    const toolResults = await Promise.all(
      assistantMessage.tool_calls.map((toolCall) =>
        toolLimit(async () => {
          const toolName = toolCall.function.name;
          let parsedArgs: unknown;
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            parsedArgs = {};
          }

          const callEvent: AgenticEvent = {
            type: "tool_call",
            toolName,
            toolCallId: toolCall.id,
            input: parsedArgs,
            botId: context.botId,
            botName: context.botName,
            iteration,
          };
          events.push(callEvent);
          onEvent?.(callEvent);

          const tool = getTool(toolName);
          let result: unknown;

          if (!tool) {
            result = { error: `Unknown tool: ${toolName}` };
          } else if (context.clientId && context.botId) {
            const permCheck = await checkToolPermission(context.clientId, context.botId, toolName);

            if (!permCheck.allowed) {
              result = { error: `Permission denied: ${permCheck.reason || "Tool not allowed for this bot"}` };
              const blockedEvent: AgenticEvent = {
                type: "tool_blocked",
                toolName,
                toolCallId: toolCall.id,
                content: permCheck.reason || "Tool not allowed for this bot",
                botId: context.botId,
                botName: context.botName,
                iteration,
              };
              events.push(blockedEvent);
              onEvent?.(blockedEvent);
            } else {
              result = await executeToolWithRetry(tool, parsedArgs, context);
            }
          } else {
            result = await executeToolWithRetry(tool, parsedArgs, context);
          }

          const isError = typeof result === "object" && result !== null && "error" in result;
          auditToolExecution(context, toolName, !isError);

          const resultEvent: AgenticEvent = {
            type: "tool_result",
            toolName,
            toolCallId: toolCall.id,
            input: parsedArgs,
            output: result,
            botId: context.botId,
            botName: context.botName,
            iteration,
          };
          events.push(resultEvent);
          onEvent?.(resultEvent);

          return { toolCallId: toolCall.id, result };
        })
      )
    );

    for (const { toolCallId, result } of toolResults) {
      loopMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: JSON.stringify(result),
      });
    }
  }

  const fallbackContent = "I've reached the maximum number of processing steps. Here's what I've gathered so far based on the tools I've used.";
  const fallbackEvent: AgenticEvent = {
    type: "message",
    content: fallbackContent,
    botId: context.botId,
    botName: context.botName,
  };
  events.push(fallbackEvent);
  onEvent?.(fallbackEvent);

  const completeEvent: AgenticEvent = { type: "bot_complete", botId: context.botId, botName: context.botName };
  events.push(completeEvent);
  onEvent?.(completeEvent);

  return { finalContent: fallbackContent, events };
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
