import { isStuckOutput } from "../ai-safety/loop-detection";
import { callWithFallback } from "../ai-safety/model-fallback";
import type { CommunicationStrategy } from "@workspace/db";

export interface SanitizedRelay {
  content: string;
  mutated: boolean;
  mutations: string[];
  fromAgent: string;
  toAgent: string;
}

const MAX_RELAY_TOKENS = 4096;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_RELAY_CHARS = MAX_RELAY_TOKENS * APPROX_CHARS_PER_TOKEN;

const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "system_override", pattern: /\[SYSTEM\][\s\S]*?\[\/SYSTEM\]/gi },
  { name: "role_escape", pattern: /(?:you are now|ignore (?:all )?(?:previous|above|prior) instructions?|disregard (?:all )?(?:previous|above|prior))/gi },
  { name: "prompt_injection_delimiter", pattern: /(?:###\s*(?:SYSTEM|INSTRUCTION|OVERRIDE)|<<<\s*SYSTEM\s*>>>|<\|im_start\|>system)/gi },
  { name: "instruction_terminator", pattern: /(?:\]\]\]|\[END\]|<END_OF_SYSTEM_PROMPT>)/gi },
  { name: "role_play_escape", pattern: /(?:pretend you are|act as if you are|roleplay as|your new role is|forget you are)/gi },
  { name: "jailbreak_prefix", pattern: /(?:DAN mode|developer mode|unrestricted mode|god mode)/gi },
];

const SUMMARY_MODEL = "gpt-4o-mini";

async function summarizeIfOverBudget(content: string, fromAgent: string): Promise<{ content: string; summarized: boolean }> {
  if (content.length <= MAX_RELAY_CHARS) {
    return { content, summarized: false };
  }

  try {
    const prompt = `Summarize the following agent output concisely, preserving all key findings, decisions, and conclusions. Keep under ${MAX_RELAY_TOKENS} tokens.

Agent: ${fromAgent}
Output: ${content.slice(0, MAX_RELAY_CHARS * 2)}`;

    const result = await callWithFallback({
      model: SUMMARY_MODEL,
      messages: [
        { role: "system", content: "You are a precise summarizer. Preserve all critical information." },
        { role: "user", content: prompt },
      ],
      maxCompletionTokens: MAX_RELAY_TOKENS,
    });

    const summarized = result.completion.choices[0]?.message?.content ?? content.slice(0, MAX_RELAY_CHARS);
    return { content: summarized, summarized: true };
  } catch {
    return { content: content.slice(0, MAX_RELAY_CHARS), summarized: true };
  }
}

export async function sanitize(
  agentOutput: string,
  fromAgent: string,
  toAgent: string,
  strategy: CommunicationStrategy,
  priorTurnContents: string[] = [],
  sessionId?: string,
): Promise<SanitizedRelay> {
  const mutations: string[] = [];
  let content = agentOutput;

  if (isStuckOutput(content, priorTurnContents, 0.9)) {
    mutations.push(`stuck-loop-detected: output has ≥90% token overlap with prior turns (session=${sessionId ?? "unknown"})`);
    console.warn(`[AgentRelaySanitizer] Stuck loop detected from ${fromAgent} → ${toAgent} in strategy ${strategy}`);
  }

  for (const { name, pattern } of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      const original = content;
      content = content.replace(pattern, `[FILTERED:${name}]`);
      if (content !== original) {
        mutations.push(`prompt-injection-stripped: pattern "${name}" removed`);
      }
    }
    pattern.lastIndex = 0;
  }

  const { content: maybeCompressed, summarized } = await summarizeIfOverBudget(content, fromAgent);
  if (summarized) {
    mutations.push(`relay-token-budget: output from ${fromAgent} exceeded ${MAX_RELAY_TOKENS} token budget and was summarized via EFFICIENT-tier LLM`);
    content = maybeCompressed;
  }

  const mutated = mutations.length > 0;

  if (mutated) {
    console.log(`[AgentRelaySanitizer] [SANITIZED] ${fromAgent} → ${toAgent} (${strategy}): ${mutations.join("; ")}`);
  }

  return {
    content,
    mutated,
    mutations,
    fromAgent,
    toAgent,
  };
}
