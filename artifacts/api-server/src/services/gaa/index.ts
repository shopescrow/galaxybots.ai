// Galaxy Autonomous Agent (GAA) — public service surface.
export * from "./constitution";
export * from "./compliance-gate";
export * from "./mode-classifier";
export * from "./cost-envelope";
export * from "./action-ledger";
export * from "./memory-tiers";
export * from "./suspense-queue";
export * from "./conflict-arbiter";
export * from "./challenger";
export * from "./escalation";
export * from "./learning-loop";
export * from "./dead-letter";
export * from "./engine";
export * from "./bootstrap";

import { runEngineCycle, type CycleSummary } from "./engine";
import { detectAndResolveConflicts } from "./conflict-arbiter";
import { reapDeadLetters } from "./dead-letter";
import { consolidateMemory } from "./memory-tiers";
import { expireUndoWindows } from "./action-ledger";

let tickCount = 0;

/**
 * One full GAA cycle: resolve conflicts, run the engine over runnable goals,
 * then run maintenance (dead-letter reaping, memory consolidation, undo-window
 * expiry). Heavy maintenance runs every 5th tick to keep ticks cheap.
 */
export async function runGaaCycle(): Promise<CycleSummary> {
  tickCount++;

  // Arbitrate goal conflicts before selecting work.
  await detectAndResolveConflicts().catch((e) =>
    console.error("[gaa] conflict arbitration failed:", e),
  );

  const summary = await runEngineCycle();

  if (tickCount % 5 === 0) {
    await Promise.allSettled([
      reapDeadLetters(),
      consolidateMemory(),
      expireUndoWindows(),
    ]);
  }

  return summary;
}
