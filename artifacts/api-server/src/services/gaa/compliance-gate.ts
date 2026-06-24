import { db, gaaAuditEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// KiloPro compliance gate — the mandatory check between Constitution Check and
// Execution. It enforces purpose-limitation + PII allow-listing, records an
// auditable event, and (best-effort) pushes the event to KiloPro.
// ---------------------------------------------------------------------------

export interface ComplianceGateInput {
  goalId?: number | null;
  title: string;
  toolName?: string | null;
  purpose?: string | null;
  involvesPii?: boolean;
  // Purposes that the goal/client is permitted to process data for.
  allowedPurposes?: string[];
}

export interface ComplianceGateResult {
  passed: boolean;
  decision: "allow" | "block" | "flag";
  violations: string[];
  auditEventId: number;
}

// Lawful purposes recognised by the platform (purpose-limitation allowlist).
export const RECOGNISED_PURPOSES = [
  "service_delivery",
  "client_communication",
  "analytics",
  "compliance",
  "security",
  "billing",
  "platform_improvement",
];

// Data-minimisation: only these lawful purposes legitimately justify touching
// PII. A purpose like "analytics" or "platform_improvement" must NOT process
// raw personal data — that is a purpose-limitation / minimisation breach.
export const PII_PERMITTED_PURPOSES = [
  "service_delivery",
  "client_communication",
  "compliance",
  "security",
  "billing",
];

// Tool allowlist for PII-touching actions. Any tool that reads/processes PII
// must be explicitly listed here; everything else is blocked at the gate.
export const PII_ALLOWED_TOOLS = [
  "gaa.advance",
  "crm.read_contact",
  "email.send_client",
  "billing.read_invoice",
];

export async function runComplianceGate(
  input: ComplianceGateInput,
): Promise<ComplianceGateResult> {
  const violations: string[] = [];
  const involvesPii = Boolean(input.involvesPii);

  // 1. Purpose-limitation: any PII-touching action needs a declared purpose.
  if (involvesPii && !input.purpose) {
    violations.push("PII access without a declared purpose (purpose-limitation).");
  }

  // 2. The declared purpose must be a recognised lawful purpose.
  if (input.purpose && !RECOGNISED_PURPOSES.includes(input.purpose)) {
    violations.push(
      `Declared purpose "${input.purpose}" is not a recognised lawful purpose.`,
    );
  }

  // 3. If the goal restricts allowed purposes, enforce them.
  if (
    input.purpose &&
    input.allowedPurposes &&
    input.allowedPurposes.length > 0 &&
    !input.allowedPurposes.includes(input.purpose)
  ) {
    violations.push(
      `Purpose "${input.purpose}" is outside this goal's allowed purposes.`,
    );
  }

  // 4. Data-minimisation: the declared purpose must be one that legitimately
  // needs PII. PII processed for an incompatible purpose is a breach.
  if (
    involvesPii &&
    input.purpose &&
    RECOGNISED_PURPOSES.includes(input.purpose) &&
    !PII_PERMITTED_PURPOSES.includes(input.purpose)
  ) {
    violations.push(
      `Purpose "${input.purpose}" does not justify processing PII (data-minimisation).`,
    );
  }

  // 5. PII tool allow-listing (fail-closed): a PII-touching step must name the
  // tool that will process the data, and that tool must be on the allow-list.
  // Omitting the tool does NOT bypass the control — it is itself a violation.
  if (involvesPii) {
    if (!input.toolName) {
      violations.push(
        "PII-processing step did not declare a tool; cannot verify PII allow-list (fail-closed).",
      );
    } else if (!PII_ALLOWED_TOOLS.includes(input.toolName)) {
      violations.push(
        `Tool "${input.toolName}" is not on the PII allow-list; cannot process personal data.`,
      );
    }
  }

  const passed = violations.length === 0;
  const decision: ComplianceGateResult["decision"] = passed
    ? "allow"
    : "block";

  const [event] = await db
    .insert(gaaAuditEventsTable)
    .values({
      goalId: input.goalId ?? null,
      eventType: "compliance_check",
      decision,
      toolName: input.toolName ?? null,
      piiInvolved: involvesPii,
      purpose: input.purpose ?? null,
      compliancePassed: passed,
      violations,
      detail: passed
        ? `KiloPro gate passed for "${input.title}"`
        : `KiloPro gate blocked "${input.title}": ${violations.join("; ")}`,
    })
    .returning();

  // Best-effort push to KiloPro (non-blocking).
  void pushAuditToKiloPro(event.id, {
    eventType: "compliance_check",
    decision,
    passed,
    title: input.title,
    violations,
  }).catch(() => {});

  return { passed, decision, violations, auditEventId: event.id };
}

/**
 * Record a generic compliance/audit event (e.g. tool execution, rollback).
 */
export async function recordAuditEvent(params: {
  goalId?: number | null;
  eventType: string;
  decision?: "allow" | "block" | "flag";
  toolName?: string | null;
  piiInvolved?: boolean;
  purpose?: string | null;
  compliancePassed?: boolean;
  violations?: string[];
  detail?: string;
}): Promise<number> {
  const [event] = await db
    .insert(gaaAuditEventsTable)
    .values({
      goalId: params.goalId ?? null,
      eventType: params.eventType,
      decision: params.decision ?? "allow",
      toolName: params.toolName ?? null,
      piiInvolved: params.piiInvolved ?? false,
      purpose: params.purpose ?? null,
      compliancePassed: params.compliancePassed ?? true,
      violations: params.violations ?? [],
      detail: params.detail ?? null,
    })
    .returning();
  return event.id;
}

async function pushAuditToKiloPro(
  auditEventId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env["KILOPRO_PUSH_URL"];
  const apiKey = process.env["COMPLIANCE_API_KEY"];
  if (!url || !apiKey) return; // KiloPro not configured — keep local audit only.

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ source: "gaa", auditEventId, ...payload }),
    });
    if (res.ok) {
      await db
        .update(gaaAuditEventsTable)
        .set({ pushedToKilopro: true })
        .where(eq(gaaAuditEventsTable.id, auditEventId));
    }
  } catch {
    // Swallow — audit is already persisted locally.
  }
}
