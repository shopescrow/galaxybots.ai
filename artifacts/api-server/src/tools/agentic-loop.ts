import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { openai } from "@workspace/integrations-openai-ai-server";
import { isRateLimitError } from "@workspace/integrations-openai-ai-server";
import { getTool, getOpenAIToolDefinitions, type ToolContext } from "./registry";
import { db, platformAuditLogTable } from "@workspace/db";
import pLimit from "p-limit";
import pRetry from "p-retry";

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
  type: "tool_call" | "tool_result" | "message" | "bot_complete" | "error" | "done";
  botId?: number;
  botName?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  content?: string;
  iteration?: number;
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

export async function runAgenticLoop(options: AgenticLoopOptions): Promise<{
  finalContent: string;
  events: AgenticEvent[];
}> {
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

  const tools = getOpenAIToolDefinitions();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let completion;
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
          } else {
            try {
              result = await pRetry(
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
              result = { error: err instanceof Error ? err.message : "Tool execution failed" };
            }
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
