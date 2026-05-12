import { guardianHeartbeat } from "../../guardian/queen-orchestrator";

export async function runGuardianHeartbeat(): Promise<void> {
  await guardianHeartbeat();
}
