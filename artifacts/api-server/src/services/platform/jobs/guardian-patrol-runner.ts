import { runActivePatrols } from "../../guardian/queen-orchestrator";

export async function runGuardianPatrols(): Promise<void> {
  await runActivePatrols();
}
