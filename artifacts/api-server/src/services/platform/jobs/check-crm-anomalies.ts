import { listCommittedCrmIds, runAnomalyChecksForCrm } from "../../liberator/steward";

export async function checkCrmAnomalies(): Promise<void> {
  let ids: number[] = [];
  try {
    ids = await listCommittedCrmIds();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] CRM anomaly check: failed to list CRMs: ${msg}`);
    return;
  }
  if (ids.length === 0) return;

  let posted = 0;
  for (const crmId of ids) {
    try {
      const results = await runAnomalyChecksForCrm(crmId);
      posted += results.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] CRM anomaly check failed for crm ${crmId}: ${msg}`);
    }
  }
  console.log(`[scheduler] CRM anomaly check: ${ids.length} CRM(s) scanned, ${posted} insight(s) posted`);
}
