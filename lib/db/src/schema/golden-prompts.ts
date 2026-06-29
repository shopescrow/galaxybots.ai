import { pgTable, serial, text, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

/**
 * Curated golden prompts used for independent model regression evaluation.
 * Each row is a (prompt, ideal_response, task_category, difficulty) tuple
 * seeded by owners or platform defaults. The golden-eval job runs these
 * against candidate models on demand and on a weekly schedule, scoring
 * each response with the independent judge so routing regressions are
 * caught before they affect the live base.
 *
 * Ownership rules:
 *   clientId = null  → platform-wide "global" prompt (seeded at startup;
 *                      only readable by owners, not writable via API).
 *   clientId = N     → tenant-owned prompt, writeable only by that tenant.
 *
 * The regression evaluator uses ALL active prompts (global + all tenants) so
 * the full evaluation set reflects real-world query diversity. Row-level
 * ownership is enforced in the admin routes so no tenant can mutate or delete
 * another tenant's prompts or global baseline prompts.
 */
export const goldenPromptsTable = pgTable("golden_prompts", {
  id: serial("id").primaryKey(),
  /**
   * Owning tenant. null = global/platform prompt seeded at startup.
   * API writes always set this to the requester's clientId (never null).
   */
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  taskCategory: text("task_category").notNull(),
  difficulty: text("difficulty").notNull().default("medium"),
  prompt: text("prompt").notNull(),
  idealResponse: text("ideal_response"),
  scoringRubric: text("scoring_rubric"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GoldenPrompt = typeof goldenPromptsTable.$inferSelect;

/**
 * Per-run results from the golden-prompt regression evaluator.
 * One row per (eval run, model, prompt). The `judgeScore` is assigned by the
 * independent judge (not the model under test), so it is immune to
 * self-reporting bias. Aggregate pass rates per model are surfaced in owner
 * analytics; a regression (mean score drop vs prior run) is flagged in the
 * `regressionFlag` column.
 */
export const goldenEvalRunsTable = pgTable("golden_eval_runs", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull(),
  triggeredBy: text("triggered_by").notNull().default("scheduler"),
  promptId: integer("prompt_id").references(() => goldenPromptsTable.id, { onDelete: "cascade" }),
  taskCategory: text("task_category").notNull(),
  difficulty: text("difficulty").notNull().default("medium"),
  model: text("model").notNull(),
  judgeScore: real("judge_score"),
  judgeModel: text("judge_model"),
  latencyMs: integer("latency_ms"),
  regressionFlag: boolean("regression_flag").notNull().default(false),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GoldenEvalRun = typeof goldenEvalRunsTable.$inferSelect;
