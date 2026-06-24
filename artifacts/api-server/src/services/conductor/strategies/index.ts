import { callWithFallback } from "../../ai-safety/model-fallback";
import { trimToFitContextWindow } from "../../ai-safety/context-window";
import type { CommunicationStrategy } from "@workspace/db";

export interface StrategyAgent {
  name: string;
  systemPrompt: string;
}

export interface StrategyInput {
  taskDescription: string;
  userContent: string;
  agents: StrategyAgent[];
  clientId?: number;
  botId?: number;
  conversationId?: number;
  onProgress?: (event: { type: string; content: string; [key: string]: unknown }) => void;
}

export interface StrategyResult {
  content: string;
  agentsUsed: string[];
  durationMs: number;
}

const MODEL = "gpt-5.4";
const FALLBACK_MODEL = "gpt-4o-mini";

async function callAgent(
  systemPrompt: string,
  userContent: string,
  temperature = 0.7,
  clientId?: number,
  botId?: number,
  conversationId?: number,
): Promise<string> {
  const msgs = trimToFitContextWindow(
    [{ role: "system" as const, content: systemPrompt }, { role: "user" as const, content: userContent }],
    MODEL,
  );
  const result = await callWithFallback({
    model: MODEL,
    messages: msgs,
    temperature,
    clientId,
    botId,
    conversationId,
  });
  return result.completion.choices[0]?.message?.content ?? "";
}

export async function executeParallelSynthesis(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId } = input;

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — running ${agents.length} agents in parallel…`, strategy: "parallel_synthesis" });

  const temperatures = agents.map((_, i) => parseFloat((0.3 + i * (0.5 / Math.max(agents.length - 1, 1))).toFixed(2)));

  const perspectives: string[] = new Array(agents.length).fill("");
  let completed = 0;

  await Promise.all(
    agents.map(async (agent, i) => {
      try {
        perspectives[i] = await callAgent(agent.systemPrompt, userContent, temperatures[i], clientId, botId, conversationId);
      } catch {
        perspectives[i] = "";
      }
      completed++;
      onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${completed}/${agents.length} perspectives captured`, strategy: "parallel_synthesis" });
    }),
  );

  onProgress?.({ type: "conductor_synthesizing", content: "GalaxyMind — synthesizing all perspectives into one definitive response…", strategy: "parallel_synthesis" });

  const synthesisPrompt = `You are synthesizing ${agents.length} independent analytical perspectives on the same question. Produce a single, definitive, authoritative response.

Rules:
- Integrate the strongest reasoning from all perspectives
- Resolve contradictions by choosing the most defensible position  
- Capture nuances raised across multiple perspectives
- Eliminate redundancy and write as a single unified voice

The ${agents.length} perspectives:

${perspectives.filter(Boolean).map((p, i) => `--- Perspective ${i + 1} ---\n${p}`).join("\n\n")}

Write the single definitive synthesized response:`;

  const synthMsgs = trimToFitContextWindow(
    [{ role: "system" as const, content: synthesisPrompt }, { role: "user" as const, content: userContent }],
    MODEL,
  );
  const synthResult = await callWithFallback({ model: MODEL, messages: synthMsgs, clientId, botId, conversationId });
  const content = synthResult.completion.choices[0]?.message?.content ?? perspectives.find(Boolean) ?? "";

  return { content, agentsUsed: agents.map((a) => a.name), durationMs: Date.now() - start };
}

export async function executeSequentialDebate(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId } = input;

  if (agents.length < 2) {
    return executeParallelSynthesis(input);
  }

  onProgress?.({ type: "conductor_progress", content: "GalaxyMind — starting sequential debate…", strategy: "sequential_debate" });

  const [proposer, ...debaters] = agents;

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${proposer.name} forming initial position…`, strategy: "sequential_debate" });
  let currentPosition = await callAgent(proposer.systemPrompt, userContent, 0.7, clientId, botId, conversationId);

  for (let i = 0; i < debaters.length; i++) {
    const debater = debaters[i];
    const debatePrompt = `${debater.systemPrompt}

The previous agent produced this position:
---
${currentPosition}
---

Critically evaluate this position. Identify weaknesses, gaps, or errors. Then produce a refined, improved response that incorporates the strongest elements while correcting the flaws. User's original question: ${userContent}`;

    onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${debater.name} critiquing and refining… (${i + 2}/${agents.length})`, strategy: "sequential_debate" });
    const refined = await callAgent(debater.systemPrompt, debatePrompt, 0.6, clientId, botId, conversationId);
    if (refined) currentPosition = refined;
  }

  onProgress?.({ type: "conductor_synthesizing", content: "GalaxyMind — debate complete, finalizing response…", strategy: "sequential_debate" });

  return { content: currentPosition, agentsUsed: agents.map((a) => a.name), durationMs: Date.now() - start };
}

export async function executeHierarchicalDelegation(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId } = input;

  if (agents.length < 2) {
    return executeParallelSynthesis(input);
  }

  const [lead, ...specialists] = agents;

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${lead.name} decomposing task into subtasks…`, strategy: "hierarchical_delegation" });

  const decompositionPrompt = `${lead.systemPrompt}

You are the lead agent. Decompose the following task into exactly ${specialists.length} specific subtask(s), one per available specialist agent.
Available specialists: ${specialists.map((s, i) => `${i + 1}. ${s.name}`).join(", ")}

Task: ${userContent}

Return a JSON array of subtask strings, one per specialist, in order. Return ONLY valid JSON like: ["subtask for specialist 1", "subtask for specialist 2"]`;

  const decompositionMsgs = trimToFitContextWindow(
    [{ role: "system" as const, content: decompositionPrompt }, { role: "user" as const, content: userContent }],
    FALLBACK_MODEL,
  );
  const decompResult = await callWithFallback({ model: FALLBACK_MODEL, messages: decompositionMsgs, clientId, botId, conversationId });
  const decompRaw = decompResult.completion.choices[0]?.message?.content ?? "[]";

  let subtasks: string[] = [];
  try {
    const match = decompRaw.match(/\[[\s\S]*\]/);
    subtasks = match ? (JSON.parse(match[0]) as string[]) : [];
  } catch {
    subtasks = specialists.map(() => userContent);
  }

  const specialistOutputs: Array<{ name: string; output: string }> = [];

  await Promise.all(
    specialists.map(async (specialist, i) => {
      const subtask = subtasks[i] ?? userContent;
      onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${specialist.name} executing subtask ${i + 1}/${specialists.length}…`, strategy: "hierarchical_delegation" });
      const out = await callAgent(specialist.systemPrompt, subtask, 0.6, clientId, botId, conversationId);
      specialistOutputs[i] = { name: specialist.name, output: out };
    }),
  );

  onProgress?.({ type: "conductor_synthesizing", content: `GalaxyMind — ${lead.name} integrating specialist outputs…`, strategy: "hierarchical_delegation" });

  const integrationPrompt = `${lead.systemPrompt}

You decomposed a task and your specialists have completed their subtasks. Integrate their outputs into a single, coherent, complete response.

Original task: ${userContent}

Specialist outputs:
${specialistOutputs.map((s, i) => `--- ${s.name} (subtask ${i + 1}) ---\n${s.output}`).join("\n\n")}

Write the final integrated response that synthesizes all specialist work into a unified answer:`;

  const integrationMsgs = trimToFitContextWindow(
    [{ role: "system" as const, content: integrationPrompt }, { role: "user" as const, content: userContent }],
    MODEL,
  );
  const integrationResult = await callWithFallback({ model: MODEL, messages: integrationMsgs, clientId, botId, conversationId });
  const content = integrationResult.completion.choices[0]?.message?.content ?? specialistOutputs.map((s) => s.output).join("\n\n");

  return { content, agentsUsed: agents.map((a) => a.name), durationMs: Date.now() - start };
}

export async function executeRoundRobinReview(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId } = input;

  if (agents.length < 2) {
    return executeParallelSynthesis(input);
  }

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${agents[0].name} drafting initial response…`, strategy: "round_robin_review" });

  let currentDraft = await callAgent(agents[0].systemPrompt, userContent, 0.7, clientId, botId, conversationId);

  for (let i = 1; i < agents.length; i++) {
    const agent = agents[i];
    const buildOnPrompt = `${agent.systemPrompt}

A previous agent drafted this response to the user's question:
---
${currentDraft}
---

Build on this draft. Enhance it with your expertise — add depth, correct any errors, fill gaps, and improve clarity. The result should be meaningfully better than the draft.

Original question: ${userContent}`;

    onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${agent.name} building on draft… (${i + 1}/${agents.length})`, strategy: "round_robin_review" });
    const improved = await callAgent(agent.systemPrompt, buildOnPrompt, 0.65, clientId, botId, conversationId);
    if (improved) currentDraft = improved;
  }

  onProgress?.({ type: "conductor_synthesizing", content: "GalaxyMind — round robin complete, delivering final response…", strategy: "round_robin_review" });

  return { content: currentDraft, agentsUsed: agents.map((a) => a.name), durationMs: Date.now() - start };
}

export async function executeStrategy(
  strategy: CommunicationStrategy,
  input: StrategyInput,
): Promise<StrategyResult> {
  switch (strategy) {
    case "parallel_synthesis":
      return executeParallelSynthesis(input);
    case "sequential_debate":
      return executeSequentialDebate(input);
    case "hierarchical_delegation":
      return executeHierarchicalDelegation(input);
    case "round_robin_review":
      return executeRoundRobinReview(input);
    default:
      return executeParallelSynthesis(input);
  }
}
