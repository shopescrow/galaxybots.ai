/**
 * Agent self-actualization cycle — low-frequency orchestration job.
 *
 * Runs the self-learning & enhancement loops that extend the GAA learning
 * systems. Each sub-loop is independently fault-isolated so one failure never
 * blocks the others. The whole cycle self-gates to once every few hours and is
 * a no-op when the global kill switch is engaged (beyond the emergency
 * rollback of any live self-modifications).
 *
 *   1. deep reflection on recent significant failures
 *   2. self-directed practice on weak capabilities (budgeted)
 *   3. cross-agent knowledge distillation
 *   4. shadow-test evaluation + promotion of pending self-modifications
 *   5. telemetry snapshot
 */

import {
  runDeepReflection,
  runPracticeLoop,
  runKnowledgeDistillation,
  evaluateShadowModifications,
  rollbackAllPromoted,
  emitSelfActualizationMetrics,
  isKillSwitchActive,
  type ReflectionResult,
  type PracticeOutcome,
  type TransferOutcome,
  type ShadowEvaluation,
} from "../../gaa/self-actualization";

const CYCLE_INTERVAL_MS = 3 * 60 * 60 * 1000; // every 3 hours
let lastRun = 0;

export async function runSelfActualizationCycle(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < CYCLE_INTERVAL_MS) return;
  lastRun = now;

  const killed = await isKillSwitchActive();
  if (killed) {
    // Safety first: ensure no live self-modifications remain active, then emit
    // a telemetry snapshot and stop.
    const rolledBack = await rollbackAllPromoted("Kill switch engaged").catch((e) => {
      console.error("[self-actualization] rollback-all failed:", e);
      return 0;
    });
    console.log(`[self-actualization] kill switch active — rolled back ${rolledBack} live modifications`);
    await emitSelfActualizationMetrics().catch((e) =>
      console.error("[self-actualization] metrics emit failed:", e),
    );
    return;
  }

  const reflections = await runDeepReflection().catch((e): ReflectionResult[] => {
    console.error("[self-actualization] reflection failed:", e);
    return [];
  });

  const practice = await runPracticeLoop().catch((e): PracticeOutcome[] => {
    console.error("[self-actualization] practice loop failed:", e);
    return [];
  });

  const transfers = await runKnowledgeDistillation().catch((e): TransferOutcome[] => {
    console.error("[self-actualization] knowledge distillation failed:", e);
    return [];
  });

  const promotions = await evaluateShadowModifications().catch((e): ShadowEvaluation[] => {
    console.error("[self-actualization] shadow evaluation failed:", e);
    return [];
  });

  await emitSelfActualizationMetrics().catch((e) =>
    console.error("[self-actualization] metrics emit failed:", e),
  );

  console.log(
    `[self-actualization] cycle done: ${reflections.length} reflections, ` +
      `${practice.filter((p) => p.adopted).length}/${practice.length} practice gains adopted, ` +
      `${transfers.filter((t) => t.status === "applied").length}/${transfers.length} transfers applied, ` +
      `${promotions.filter((p) => p.promoted).length}/${promotions.length} modifications promoted`,
  );
}
