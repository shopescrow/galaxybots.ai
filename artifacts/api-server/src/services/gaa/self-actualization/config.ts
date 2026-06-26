import { db, selfActualizationControlTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Self-actualization control plane: kill switch + budgets. Values are read
// from the self_actualization_control key/value table, falling back to env
// overrides and finally to safe code defaults. A single global kill switch
// halts ALL autonomous self-change (practice adoption, transfers, promotions).
// ---------------------------------------------------------------------------

export const CONTROL_KEYS = {
  killSwitch: "kill_switch",
  practiceBudgetCents: "practice_budget_cents",
  practiceMaxRunsPerCycle: "practice_max_runs_per_cycle",
} as const;

const DEFAULTS = {
  // Total cents the practice loop may spend per cycle across all bots.
  practiceBudgetCents: Number(process.env.SELF_ACT_PRACTICE_BUDGET_CENTS ?? 200),
  practiceMaxRunsPerCycle: Number(process.env.SELF_ACT_PRACTICE_MAX_RUNS ?? 6),
};

async function getControl(key: string) {
  try {
    const [row] = await db
      .select()
      .from(selfActualizationControlTable)
      .where(eq(selfActualizationControlTable.key, key))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

async function setControl(
  key: string,
  values: { boolValue?: boolean; numValue?: number; textValue?: string },
  updatedBy = "system",
): Promise<void> {
  await db
    .insert(selfActualizationControlTable)
    .values({
      key,
      boolValue: values.boolValue ?? null,
      numValue: values.numValue ?? null,
      textValue: values.textValue ?? null,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: selfActualizationControlTable.key,
      set: {
        boolValue: values.boolValue ?? null,
        numValue: values.numValue ?? null,
        textValue: values.textValue ?? null,
        updatedBy,
        updatedAt: new Date(),
      },
    });
}

/** Global kill switch — when true, no autonomous self-change may be applied. */
export async function isKillSwitchActive(): Promise<boolean> {
  if (process.env.SELF_ACT_KILL_SWITCH === "true") return true;
  const row = await getControl(CONTROL_KEYS.killSwitch);
  return row?.boolValue === true;
}

export async function setKillSwitch(
  active: boolean,
  updatedBy = "system",
): Promise<void> {
  await setControl(CONTROL_KEYS.killSwitch, { boolValue: active }, updatedBy);
}

export async function getPracticeBudgetCents(): Promise<number> {
  const row = await getControl(CONTROL_KEYS.practiceBudgetCents);
  const v = row?.numValue;
  return typeof v === "number" && v > 0 ? v : DEFAULTS.practiceBudgetCents;
}

export async function getPracticeMaxRunsPerCycle(): Promise<number> {
  const row = await getControl(CONTROL_KEYS.practiceMaxRunsPerCycle);
  const v = row?.numValue;
  return typeof v === "number" && v > 0
    ? Math.floor(v)
    : DEFAULTS.practiceMaxRunsPerCycle;
}
