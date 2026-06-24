import { runGaaCycle } from "../../gaa";

// Scheduler entry point for the Galaxy Autonomous Agent. One tick runs the
// full GAA cycle (conflict arbitration → engine → maintenance).
export async function runGaaTick(): Promise<void> {
  const summary = await runGaaCycle();
  if (summary.processed > 0) {
    console.log(
      `[gaa] tick: processed=${summary.processed} executed=${summary.executed} ` +
        `escalated=${summary.escalated} completed=${summary.completed} blocked=${summary.blocked}`,
    );
  }
}
