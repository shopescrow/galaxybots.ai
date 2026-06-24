import type { CoordinatorRole } from "@workspace/db";
import type { CommunicationStrategy } from "@workspace/db";

const VALID_ROLES: CoordinatorRole[] = ["thinker", "worker", "verifier"];
const VALID_STRATEGIES: CommunicationStrategy[] = [
  "parallel_synthesis",
  "sequential_debate",
  "hierarchical_delegation",
  "round_robin_review",
];
const MIN_RATIONALE_WORDS = 4;

export interface CoordinationOutputSchema {
  availableBotIds: number[];
  availableBotCount: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  fieldErrors: string[];
}

export function validateCoordinatorOutput(
  rawOutput: unknown,
  schema: CoordinationOutputSchema,
): ValidationResult {
  const fieldErrors: string[] = [];

  if (!rawOutput || typeof rawOutput !== "object") {
    return { valid: false, reason: "Output is not an object", fieldErrors: ["output_type"] };
  }

  const output = rawOutput as Record<string, unknown>;

  const roleAssignments = output.roleAssignments;
  if (!Array.isArray(roleAssignments) || roleAssignments.length === 0) {
    fieldErrors.push("roleAssignments: missing or empty array");
  } else {
    for (let i = 0; i < roleAssignments.length; i++) {
      const assignment = roleAssignments[i] as Record<string, unknown>;

      const botId = Number(assignment?.botId);
      if (!botId || isNaN(botId)) {
        fieldErrors.push(`roleAssignments[${i}].botId: missing or non-numeric`);
      } else if (!schema.availableBotIds.includes(botId)) {
        fieldErrors.push(`roleAssignments[${i}].botId: bot ${botId} not found in active bot registry`);
      }

      const role = assignment?.role as string | undefined;
      if (!role || !VALID_ROLES.includes(role as CoordinatorRole)) {
        fieldErrors.push(`roleAssignments[${i}].role: "${role}" is not a valid CoordinatorRole (${VALID_ROLES.join("|")})`);
      }

      const reasoning = assignment?.reasoning as string | undefined;
      if (!reasoning || typeof reasoning !== "string") {
        fieldErrors.push(`roleAssignments[${i}].reasoning: missing`);
      } else {
        const wordCount = reasoning.trim().split(/\s+/).filter(Boolean).length;
        if (wordCount < MIN_RATIONALE_WORDS) {
          fieldErrors.push(`roleAssignments[${i}].reasoning: too short (${wordCount} words, minimum ${MIN_RATIONALE_WORDS})`);
        }
      }
    }
  }

  const taskCategory = output.taskCategory as string | undefined;
  if (!taskCategory || typeof taskCategory !== "string") {
    fieldErrors.push("taskCategory: missing or not a string");
  }

  if (fieldErrors.length > 0) {
    const reason = `Coordinator output validation failed: ${fieldErrors.join("; ")}`;
    logValidationFailure(rawOutput, reason).catch(() => {});
    return { valid: false, reason, fieldErrors };
  }

  return { valid: true, fieldErrors: [] };
}

export function validateConductorOutput(
  rawOutput: unknown,
  schema: CoordinationOutputSchema,
): ValidationResult {
  const fieldErrors: string[] = [];

  if (!rawOutput || typeof rawOutput !== "object") {
    return { valid: false, reason: "Conductor output is not an object", fieldErrors: ["output_type"] };
  }

  const output = rawOutput as Record<string, unknown>;

  const strategy = output.strategy as string | undefined;
  if (!strategy || !VALID_STRATEGIES.includes(strategy as CommunicationStrategy)) {
    fieldErrors.push(`strategy: "${strategy}" is not a valid CommunicationStrategy (${VALID_STRATEGIES.join("|")})`);
  }

  const rationale = output.rationale as string | undefined;
  if (!rationale || typeof rationale !== "string") {
    fieldErrors.push("rationale: missing or not a string");
  } else {
    const wordCount = rationale.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_RATIONALE_WORDS) {
      fieldErrors.push(`rationale: too short (${wordCount} words, minimum ${MIN_RATIONALE_WORDS})`);
    }
  }

  if (fieldErrors.length > 0) {
    const reason = `Conductor output validation failed: ${fieldErrors.join("; ")}`;
    logValidationFailure(rawOutput, reason).catch(() => {});
    return { valid: false, reason, fieldErrors };
  }

  return { valid: true, fieldErrors: [] };
}

async function logValidationFailure(rawOutput: unknown, reason: string): Promise<void> {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");

    await db.execute(sql`
      INSERT INTO coordinator_validation_failures (raw_output, failure_reason, occurred_at)
      VALUES (${JSON.stringify(rawOutput)}::jsonb, ${reason}, NOW())
      ON CONFLICT DO NOTHING
    `);
  } catch {
    console.error("[CoordinationOutputValidator] Validation failure logged to console (DB table may not exist yet):", reason, JSON.stringify(rawOutput).slice(0, 500));
  }
}
