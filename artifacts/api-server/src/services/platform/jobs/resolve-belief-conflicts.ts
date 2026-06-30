import { resolveBeliefConflicts } from "../../gaa/self-actualization/belief-conflict-resolution";

/**
 * Background job: LLM-mediated belief conflict arbitration.
 *
 * Picks up pending belief_conflicts records (created by the knowledge
 * distillation pass whenever two agents hold contradictory beliefs) and runs
 * each through the arbitration model.  Rate-gated to once every 4 hours
 * internally — the scheduler calls this at low-frequency tick rate and the
 * service itself suppresses duplicate runs within the window.
 */
export async function runBeliefConflictResolution(): Promise<void> {
  await resolveBeliefConflicts();
}
