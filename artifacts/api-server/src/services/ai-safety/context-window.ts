import type { OpenAI } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;
import { openai } from "@workspace/integrations-openai-ai-server";

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5.4": 128_000,
  "gpt-4o": 128_000,
  "gpt-5-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-3.5-turbo": 16_385,
  "claude-sonnet-4-6": 200_000,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;
const CONTEXT_WINDOW_USAGE_LIMIT = 0.8;
const SLIDING_WINDOW_THRESHOLD = 15;
const KEEP_RECENT_MESSAGES = 10;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

export function estimateMessagesTokens(messages: ChatCompletionMessageParam[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ("text" in part && typeof part.text === "string") {
          total += estimateTokens(part.text);
        }
      }
    }
    total += 4;
  }
  return total;
}

export function getModelContextWindow(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
}

export function getMaxAllowedTokens(model: string): number {
  return Math.floor(getModelContextWindow(model) * CONTEXT_WINDOW_USAGE_LIMIT);
}

export interface SlidingWindowResult {
  messages: ChatCompletionMessageParam[];
  summarizedCount: number;
  summary?: string;
}

export async function summarizeOlderMessages(
  olderMessages: ChatCompletionMessageParam[],
  existingSummary?: string,
): Promise<string> {
  const conversationText = olderMessages
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      return `[${m.role}]: ${content.substring(0, 300)}`;
    })
    .join("\n");

  const contextPrefix = existingSummary ? `Previous context: ${existingSummary}\n\n` : "";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 400,
      messages: [
        {
          role: "system",
          content: "You are a conversation summarizer. Condense the conversation into a concise summary (3-5 sentences) preserving key decisions, questions asked, answers given, and action items. Be factual and specific.",
        },
        {
          role: "user",
          content: `${contextPrefix}Summarize this conversation:\n${conversationText}`,
        },
      ],
    });
    return completion.choices[0]?.message?.content ?? conversationText.substring(0, 500);
  } catch (err) {
    console.error("[ContextWindow] LLM summarization failed, using truncation fallback:", err);
    const parts: string[] = [];
    if (existingSummary) parts.push(existingSummary);
    for (const msg of olderMessages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (content.length > 0) parts.push(`[${msg.role}]: ${content.substring(0, 200)}`);
    }
    return parts.join("\n");
  }
}

export async function applySlidingWindow(
  systemPrompt: ChatCompletionMessageParam,
  conversationMessages: ChatCompletionMessageParam[],
  existingSummary?: string,
): Promise<SlidingWindowResult> {
  if (conversationMessages.length <= SLIDING_WINDOW_THRESHOLD) {
    if (existingSummary) {
      return {
        messages: [
          systemPrompt,
          { role: "system", content: `[Previous conversation summary]: ${existingSummary}` },
          ...conversationMessages,
        ],
        summarizedCount: 0,
      };
    }
    return { messages: [systemPrompt, ...conversationMessages], summarizedCount: 0 };
  }

  const olderMessages = conversationMessages.slice(0, -KEEP_RECENT_MESSAGES);
  const recentMessages = conversationMessages.slice(-KEEP_RECENT_MESSAGES);

  const combinedSummary = await summarizeOlderMessages(olderMessages, existingSummary);

  return {
    messages: [
      systemPrompt,
      { role: "system", content: `[Conversation context summary — ${olderMessages.length} earlier messages condensed]:\n${combinedSummary}` },
      ...recentMessages,
    ],
    summarizedCount: olderMessages.length,
    summary: combinedSummary,
  };
}

export function trimToFitContextWindow(
  messages: ChatCompletionMessageParam[],
  model: string,
): ChatCompletionMessageParam[] {
  const maxTokens = getMaxAllowedTokens(model);
  let currentTokens = estimateMessagesTokens(messages);

  if (currentTokens <= maxTokens) return messages;

  const result = [...messages];

  while (currentTokens > maxTokens && result.length > 2) {
    const removeIndex = result[1]?.role === "system" ? 2 : 1;
    if (removeIndex >= result.length) break;
    const removed = result.splice(removeIndex, 1)[0];
    if (removed) {
      const removedTokens = typeof removed.content === "string" ? estimateTokens(removed.content) : 0;
      currentTokens -= removedTokens;
    }
  }

  return result;
}
