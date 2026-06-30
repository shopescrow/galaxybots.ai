import { computeMetricRollups } from "../../observability/metric-rollup.js";
import { evaluateSlos } from "../../observability/slo-evaluator.js";

export async function runMetricRollupsAndSloEval(): Promise<void> {
  await computeMetricRollups();
  await evaluateSlos();
}
