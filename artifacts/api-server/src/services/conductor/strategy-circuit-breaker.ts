import { isStuckOutput } from "../ai-safety/loop-detection";
import { callWithFallback } from "../ai-safety/model-fallback";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";
import type { CommunicationStrategy } from "@workspace/db";

export interface TurnOutput {
  turnIndex: number;
  agentName: string;
  content: string;
  qualityScore: number;
  passed: boolean;
}

export interface StrategyBreakDecision {
  shouldAbort: boolean;
  reason?: string;
  salvageableTurns: TurnOutput[];
}

const sessionPriorTurns = new Map<string, string[]>();
const sessionConsecutiveFailures = new Map<string, number>();

const MID_STRATEGY_FLOOR = 0.45;
const CONSECUTIVE_FAIL_THRESHOLD = 2;
const EVALUATION_MODEL = resolveCapability(ModelCapability.REASONING_EFFICIENT);

async function scoreRelevance(content: string, taskDescription: string): Promise<number> {
  if (!content || content.trim().length === 0) return 0;

  try {
    const prompt = `Rate the relevance of this response to the task. Return ONLY a JSON object: {"score": <0.0-1.0>}

Task: ${taskDescription.slice(0, 300)}
Response: ${content.slice(0, 600)}`;

    const result = await callWithFallback({
      model: EVALUATION_MODEL,
      messages: [
        { role: "system", content: "You are a strict relevance scorer. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      maxCompletionTokens: 60,
    });

    const raw = result.completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]) as Record<string, unknown>; } catch { /* ignore */ }
      }
    }
    const score = Math.min(1, Math.max(0, Number(parsed.score ?? 0.7)));
    return score;
  } catch {
    return 0.7;
  }
}

export async function checkMidStrategyQuality(
  sessionId: string,
  turnIndex: number,
  turnOutput: string,
  agentName: string,
  strategy: CommunicationStrategy,
  taskDescription: string,
  priorPassedTurns: TurnOutput[],
): Promise<StrategyBreakDecision> {
  if (strategy === "parallel_synthesis") {
    return { shouldAbort: false, salvageableTurns: priorPassedTurns };
  }

  const priorContents = sessionPriorTurns.get(sessionId) ?? [];

  const stuck = isStuckOutput(turnOutput, priorContents, 0.9);
  if (stuck) {
    const failCount = (sessionConsecutiveFailures.get(sessionId) ?? 0) + 1;
    sessionConsecutiveFailures.set(sessionId, failCount);

    const newTurn: TurnOutput = {
      turnIndex,
      agentName,
      content: turnOutput,
      qualityScore: 0.1,
      passed: false,
    };

    if (failCount >= CONSECUTIVE_FAIL_THRESHOLD) {
      sessionPriorTurns.delete(sessionId);
      sessionConsecutiveFailures.delete(sessionId);
      console.warn(
        `[StrategyCircuitBreaker] Session ${sessionId} — stuck-loop detected for ${failCount} consecutive turns. Aborting strategy.`,
      );
      return {
        shouldAbort: true,
        reason: `Stuck-loop detected: turn ${turnIndex} output has ≥90% token overlap with prior turns for ${failCount} consecutive turns.`,
        salvageableTurns: priorPassedTurns,
      };
    }

    priorContents.push(turnOutput);
    sessionPriorTurns.set(sessionId, priorContents);
    return {
      shouldAbort: false,
      salvageableTurns: [...priorPassedTurns, newTurn],
    };
  }

  const relevanceScore = await scoreRelevance(turnOutput, taskDescription);

  const thisTurn: TurnOutput = {
    turnIndex,
    agentName,
    content: turnOutput,
    qualityScore: relevanceScore,
    passed: relevanceScore >= MID_STRATEGY_FLOOR,
  };

  if (relevanceScore < MID_STRATEGY_FLOOR) {
    const failCount = (sessionConsecutiveFailures.get(sessionId) ?? 0) + 1;
    sessionConsecutiveFailures.set(sessionId, failCount);

    console.warn(
      `[StrategyCircuitBreaker] Session ${sessionId} turn ${turnIndex} — quality below floor: ${relevanceScore.toFixed(2)} < ${MID_STRATEGY_FLOOR}. Consecutive failures: ${failCount}`,
    );

    if (failCount >= CONSECUTIVE_FAIL_THRESHOLD) {
      sessionPriorTurns.delete(sessionId);
      sessionConsecutiveFailures.delete(sessionId);
      return {
        shouldAbort: true,
        reason: `Quality below floor (${relevanceScore.toFixed(2)} < ${MID_STRATEGY_FLOOR}) for ${failCount} consecutive turns at turn ${turnIndex}.`,
        salvageableTurns: priorPassedTurns,
      };
    }

    priorContents.push(turnOutput);
    sessionPriorTurns.set(sessionId, priorContents);
    return {
      shouldAbort: false,
      salvageableTurns: [...priorPassedTurns, thisTurn],
    };
  }

  sessionConsecutiveFailures.set(sessionId, 0);
  priorContents.push(turnOutput);
  sessionPriorTurns.set(sessionId, priorContents);

  return {
    shouldAbort: false,
    salvageableTurns: [...priorPassedTurns, thisTurn],
  };
}

export function clearStrategyBreakerSession(sessionId: string): void {
  sessionPriorTurns.delete(sessionId);
  sessionConsecutiveFailures.delete(sessionId);
}
