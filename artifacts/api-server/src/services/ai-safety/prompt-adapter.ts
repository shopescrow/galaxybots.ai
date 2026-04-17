import type { OpenAI } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;

export interface AdaptedPrompt {
  system?: string;
  messages: Array<{ role: string; content: string }>;
}

export function adaptOpenAIToAnthropic(
  messages: ChatCompletionMessageParam[],
): AdaptedPrompt {
  let systemContent = "";
  const adaptedMessages: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : "";

    if (msg.role === "system") {
      if (systemContent) {
        systemContent += "\n\n" + content;
      } else {
        systemContent = content;
      }
      continue;
    }

    if (msg.role === "tool") {
      adaptedMessages.push({
        role: "user",
        content: `[Tool result]: ${content}`,
      });
      continue;
    }

    adaptedMessages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content,
    });
  }

  const merged: Array<{ role: string; content: string }> = [];
  for (const msg of adaptedMessages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n\n" + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  if (merged.length > 0 && merged[0].role !== "user") {
    merged.unshift({ role: "user", content: "[Conversation continues]" });
  }

  return {
    system: systemContent || undefined,
    messages: merged,
  };
}

export function adaptAnthropicToolSchema(openaiTools: unknown[]): unknown[] {
  return openaiTools.map((tool: unknown) => {
    const t = tool as { type: string; function: { name: string; description: string; parameters: unknown } };
    return {
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    };
  });
}

export function getModelContextLimit(model: string): number {
  const limits: Record<string, number> = {
    "gpt-5.4": 128_000,
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    "claude-sonnet-4-6": 200_000,
  };
  return limits[model] ?? 128_000;
}
