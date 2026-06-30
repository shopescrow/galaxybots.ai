/**
 * Regression tests for the Human Approval Gating hardening (Task #374).
 *
 * What is tested:
 *  1. Token signing / verification (happy path, expiry, tamper, wrong secret)
 *  2. Tiered routing — consequence_gate (risk ≥ 70 → owner, < 70 → any)
 *  3. Tiered routing — coordinator_gate (confidence ≥ 70 → owner, < 70 → any)
 *  4. createPendingApproval metadata defaults
 *  5. Approve/reject reason validation (blank, whitespace, undefined, valid, trimming)
 *  6. SLA deadline calculation (time-sensitive vs. default tools, custom config)
 *  7. SLA countdown display (expired, urgent, hour formatting)
 *  8. Context type badge labels
 *  9. Owner-only enforcement gate logic
 * 10. Batch-approve reason requirement
 * 11. Action token — action and id fidelity / tamper resistance
 */

import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function signToken(payload: { id: number; action: "approve" | "reject"; exp: number }, secret = "galaxybots-approval-link-secret"): string {
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${Buffer.from(data).toString("base64url")}.${sig}`;
}

function verifyToken(token: string, secret = "galaxybots-approval-link-secret"): { id: number; action: "approve" | "reject"; exp: number } | null {
  try {
    const [dataB64, sig] = token.split(".");
    if (!dataB64 || !sig) return null;
    const data = Buffer.from(dataB64, "base64url").toString();
    const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const payload = JSON.parse(data) as { id: number; action: "approve" | "reject"; exp: number };
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Token signing / verification
// ──────────────────────────────────────────────────────────────────────────────

describe("signApprovalToken / verifyApprovalToken", () => {
  it("round-trips a valid approve token", () => {
    const payload = { id: 42, action: "approve" as const, exp: Date.now() + 60_000 };
    const token = signToken(payload);
    const result = verifyToken(token);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(42);
    expect(result!.action).toBe("approve");
  });

  it("round-trips a valid reject token", () => {
    const payload = { id: 7, action: "reject" as const, exp: Date.now() + 60_000 };
    const token = signToken(payload);
    const result = verifyToken(token);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("reject");
  });

  it("rejects an expired token", () => {
    const payload = { id: 1, action: "approve" as const, exp: Date.now() - 1 };
    const token = signToken(payload);
    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a tampered token (wrong payload)", () => {
    const payload = { id: 1, action: "approve" as const, exp: Date.now() + 60_000 };
    const token = signToken(payload);
    const [dataB64, sig] = token.split(".");
    const tamperedData = Buffer.from(JSON.stringify({ ...payload, id: 999 })).toString("base64url");
    expect(verifyToken(`${tamperedData}.${sig}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const payload = { id: 5, action: "approve" as const, exp: Date.now() + 60_000 };
    const token = signToken(payload, "wrong-secret");
    expect(verifyToken(token, "galaxybots-approval-link-secret")).toBeNull();
  });

  it("rejects a token with missing signature segment", () => {
    expect(verifyToken("onlyonepart")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Tiered routing logic — consequence_gate
// ──────────────────────────────────────────────────────────────────────────────

describe("Tiered routing — consequence_gate", () => {
  function computeConsequenceApproverRole(riskScoreInt: number): "owner" | "any" {
    return riskScoreInt >= 70 ? "owner" : "any";
  }

  it("routes risk ≥ 70 to owner", () => {
    expect(computeConsequenceApproverRole(70)).toBe("owner");
    expect(computeConsequenceApproverRole(85)).toBe("owner");
    expect(computeConsequenceApproverRole(100)).toBe("owner");
  });

  it("routes risk < 70 to any", () => {
    expect(computeConsequenceApproverRole(69)).toBe("any");
    expect(computeConsequenceApproverRole(40)).toBe("any");
    expect(computeConsequenceApproverRole(0)).toBe("any");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Tiered routing logic — coordinator_gate
// ──────────────────────────────────────────────────────────────────────────────

describe("Tiered routing — coordinator_gate (confidence score)", () => {
  function computeCoordinatorApproverRole(confidenceScore: number): "owner" | "any" {
    return confidenceScore >= 70 ? "owner" : "any";
  }

  it("routes confidence ≥ 70 to owner", () => {
    expect(computeCoordinatorApproverRole(70)).toBe("owner");
    expect(computeCoordinatorApproverRole(99)).toBe("owner");
  });

  it("routes confidence < 70 to any", () => {
    expect(computeCoordinatorApproverRole(69)).toBe("any");
    expect(computeCoordinatorApproverRole(0)).toBe("any");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. createPendingApproval metadata contract
// ──────────────────────────────────────────────────────────────────────────────

describe("createPendingApproval — new metadata columns", () => {
  it("maps consequenceRiskScore from float riskScore * 100", () => {
    const riskScore = 0.73;
    const consequenceRiskScoreInt = Math.round(riskScore * 100);
    expect(consequenceRiskScoreInt).toBe(73);
  });

  it("maps riskScore 0.0 to 0", () => {
    expect(Math.round(0.0 * 100)).toBe(0);
  });

  it("maps riskScore 1.0 to 100", () => {
    expect(Math.round(1.0 * 100)).toBe(100);
  });

  it("defaults contextType to null when not provided", () => {
    const params: { contextType?: string } = {};
    expect(params.contextType ?? null).toBeNull();
  });

  it("defaults requiredApproverRole to 'any' when not provided", () => {
    const params: { requiredApproverRole?: string } = {};
    expect(params.requiredApproverRole ?? "any").toBe("any");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Reason validation guard (mirrors route logic)
// ──────────────────────────────────────────────────────────────────────────────

describe("Approve/reject reason validation", () => {
  function validateReason(reason: unknown): string | null {
    const trimmed = typeof reason === "string" ? reason.trim() : "";
    return trimmed || null;
  }

  it("rejects an empty string reason", () => {
    expect(validateReason("")).toBeNull();
  });

  it("rejects a whitespace-only reason", () => {
    expect(validateReason("   ")).toBeNull();
  });

  it("rejects undefined reason", () => {
    expect(validateReason(undefined)).toBeNull();
  });

  it("accepts a valid reason string", () => {
    expect(validateReason("Reviewed and confirmed safe")).toBe("Reviewed and confirmed safe");
  });

  it("trims leading/trailing whitespace from reason", () => {
    expect(validateReason("  Safety check passed  ")).toBe("Safety check passed");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. SLA deadline calculation
// ──────────────────────────────────────────────────────────────────────────────

describe("SLA deadline calculation", () => {
  const TIME_SENSITIVE_TOOLS = [
    "send_email", "create_invoice", "send_notification",
    "post_to_slack", "send_sms", "schedule_meeting",
  ];

  function computeSla(toolName: string, config?: { defaultSlaMinutes?: number; timeSensitiveSlaMinutes?: number }) {
    const isTimeSensitive = TIME_SENSITIVE_TOOLS.includes(toolName);
    const slaMinutes = isTimeSensitive
      ? (config?.timeSensitiveSlaMinutes ?? 60)
      : (config?.defaultSlaMinutes ?? 240);
    const now = Date.now();
    const deadline = new Date(now + slaMinutes * 60 * 1000);
    return { isTimeSensitive, slaMinutes, deadline };
  }

  it("sets 60-minute SLA for time-sensitive tools (default config)", () => {
    const result = computeSla("send_email");
    expect(result.isTimeSensitive).toBe(true);
    expect(result.slaMinutes).toBe(60);
  });

  it("sets 240-minute SLA for non-time-sensitive tools (default config)", () => {
    const result = computeSla("custom_tool_xyz");
    expect(result.isTimeSensitive).toBe(false);
    expect(result.slaMinutes).toBe(240);
  });

  it("honours custom timeSensitiveSlaMinutes from config", () => {
    const result = computeSla("send_sms", { timeSensitiveSlaMinutes: 30 });
    expect(result.slaMinutes).toBe(30);
  });

  it("honours custom defaultSlaMinutes from config", () => {
    const result = computeSla("run_report", { defaultSlaMinutes: 120 });
    expect(result.slaMinutes).toBe(120);
  });

  it("deadline is in the future", () => {
    const { deadline } = computeSla("send_email");
    expect(deadline.getTime()).toBeGreaterThan(Date.now());
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. SLA countdown display logic
// ──────────────────────────────────────────────────────────────────────────────

describe("SLA countdown display", () => {
  function formatCountdown(remainingMs: number): { display: string; expired: boolean; urgent: boolean } {
    if (remainingMs <= 0) return { display: "SLA expired", expired: true, urgent: false };
    const h = Math.floor(remainingMs / 3600000);
    const m = Math.floor((remainingMs % 3600000) / 60000);
    const s = Math.floor((remainingMs % 60000) / 1000);
    const urgent = remainingMs < 5 * 60 * 1000;
    return { display: `${h > 0 ? `${h}h ` : ""}${m}m ${s}s`, expired: false, urgent };
  }

  it("shows expired for past deadline", () => {
    expect(formatCountdown(-1).expired).toBe(true);
    expect(formatCountdown(0).expired).toBe(true);
  });

  it("marks urgent when under 5 minutes", () => {
    expect(formatCountdown(4 * 60 * 1000 + 59 * 1000).urgent).toBe(true);
    expect(formatCountdown(5 * 60 * 1000).urgent).toBe(false);
  });

  it("formats hours correctly", () => {
    const { display } = formatCountdown(2 * 3600000 + 30 * 60000 + 5000);
    expect(display).toBe("2h 30m 5s");
  });

  it("omits hours when under 1h", () => {
    const { display } = formatCountdown(45 * 60000 + 3000);
    expect(display).toBe("45m 3s");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Context type labels
// ──────────────────────────────────────────────────────────────────────────────

describe("Context type badge labels", () => {
  const LABELS: Record<string, string> = { coordinator_gate: "Strategy", tool_gate: "Tool", consequence_gate: "Risk" };

  it("labels coordinator_gate as 'Strategy'", () => { expect(LABELS["coordinator_gate"]).toBe("Strategy"); });
  it("labels tool_gate as 'Tool'", () => { expect(LABELS["tool_gate"]).toBe("Tool"); });
  it("labels consequence_gate as 'Risk'", () => { expect(LABELS["consequence_gate"]).toBe("Risk"); });
  it("returns undefined for unknown types", () => { expect(LABELS["unknown_type"]).toBeUndefined(); });
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. Owner-only enforcement gate logic (mirrors route pre-check)
// ──────────────────────────────────────────────────────────────────────────────

describe("Owner-only enforcement", () => {
  function canResolve(requiredApproverRole: string, userRole: string): boolean {
    if (requiredApproverRole === "owner" && userRole !== "owner") return false;
    return true;
  }

  it("owner can resolve owner-only approval", () => {
    expect(canResolve("owner", "owner")).toBe(true);
  });

  it("admin cannot resolve owner-only approval → 403", () => {
    expect(canResolve("owner", "admin")).toBe(false);
  });

  it("admin can resolve any-role approval", () => {
    expect(canResolve("any", "admin")).toBe(true);
  });

  it("owner can resolve any-role approval", () => {
    expect(canResolve("any", "owner")).toBe(true);
  });

  it("guest cannot resolve owner-only approval", () => {
    expect(canResolve("owner", "guest")).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10. Batch-approve reason requirement
// ──────────────────────────────────────────────────────────────────────────────

describe("Batch-approve reason requirement", () => {
  function validateBatchReason(body: unknown): { ok: boolean; error?: string } {
    const reason = ((body as Record<string, unknown>)?.reason ?? "");
    const trimmed = typeof reason === "string" ? reason.trim() : "";
    if (!trimmed) return { ok: false, error: "reason is required for batch approve" };
    return { ok: true };
  }

  it("rejects batch-approve with no reason body field", () => {
    expect(validateBatchReason({ approvalIds: [1, 2] }).ok).toBe(false);
  });

  it("rejects batch-approve with blank reason", () => {
    expect(validateBatchReason({ reason: "" }).ok).toBe(false);
  });

  it("rejects batch-approve with whitespace-only reason", () => {
    expect(validateBatchReason({ reason: "  \t\n" }).ok).toBe(false);
  });

  it("accepts batch-approve with valid reason", () => {
    expect(validateBatchReason({ reason: "Reviewed and safe", approvalIds: [1] }).ok).toBe(true);
  });

  it("error message is user-friendly", () => {
    expect(validateBatchReason({}).error).toBe("reason is required for batch approve");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 11. Action token — action/id fidelity and tamper resistance
// ──────────────────────────────────────────────────────────────────────────────

describe("Action token fidelity and tamper resistance", () => {
  const SECRET = "test-fidelity-secret";

  function signFidelityToken(payload: { id: number; action: "approve" | "reject"; exp: number }): string {
    const data = JSON.stringify(payload);
    const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
    return `${Buffer.from(data).toString("base64url")}.${sig}`;
  }

  function verifyFidelityToken(token: string): { id: number; action: "approve" | "reject"; exp: number } | null {
    try {
      const [dataB64, sig] = token.split(".");
      if (!dataB64 || !sig) return null;
      const data = Buffer.from(dataB64, "base64url").toString();
      const expected = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
      const payload = JSON.parse(data) as { id: number; action: "approve" | "reject"; exp: number };
      if (Date.now() > payload.exp) return null;
      return payload;
    } catch { return null; }
  }

  it("approve token preserves action=approve", () => {
    const t = signFidelityToken({ id: 1, action: "approve", exp: Date.now() + 60_000 });
    expect(verifyFidelityToken(t)?.action).toBe("approve");
  });

  it("reject token preserves action=reject", () => {
    const t = signFidelityToken({ id: 2, action: "reject", exp: Date.now() + 60_000 });
    expect(verifyFidelityToken(t)?.action).toBe("reject");
  });

  it("approve and reject tokens for same id are distinct", () => {
    const approve = signFidelityToken({ id: 5, action: "approve", exp: Date.now() + 60_000 });
    const reject = signFidelityToken({ id: 5, action: "reject", exp: Date.now() + 60_000 });
    expect(approve).not.toBe(reject);
  });

  it("cannot upgrade a reject token to approve by tampering", () => {
    const reject = signFidelityToken({ id: 3, action: "reject", exp: Date.now() + 60_000 });
    const [dataB64, sig] = reject.split(".");
    const data = JSON.parse(Buffer.from(dataB64, "base64url").toString());
    const tampered = Buffer.from(JSON.stringify({ ...data, action: "approve" })).toString("base64url");
    expect(verifyFidelityToken(`${tampered}.${sig}`)).toBeNull();
  });

  it("cannot change id by tampering", () => {
    const token = signFidelityToken({ id: 1, action: "approve", exp: Date.now() + 60_000 });
    const [dataB64, sig] = token.split(".");
    const data = JSON.parse(Buffer.from(dataB64, "base64url").toString());
    const tampered = Buffer.from(JSON.stringify({ ...data, id: 9999 })).toString("base64url");
    expect(verifyFidelityToken(`${tampered}.${sig}`)).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 12. HTML escaping for XSS prevention in the action-link confirmation page
// ──────────────────────────────────────────────────────────────────────────────

describe("HTML escaping (XSS prevention)", () => {
  function htmlEscape(s: string | null | undefined): string {
    return (s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
  }

  it("escapes < and > in botName", () => {
    expect(htmlEscape("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes & in toolName", () => {
    expect(htmlEscape("send_email & delete")).toBe("send_email &amp; delete");
  });

  it("escapes double-quotes (attribute injection)", () => {
    expect(htmlEscape('"><img onerror=alert(1) src=x>')).toContain("&quot;");
  });

  it("escapes single-quotes", () => {
    expect(htmlEscape("it's here")).toBe("it&#39;s here");
  });

  it("leaves safe strings unchanged", () => {
    expect(htmlEscape("my_tool_name")).toBe("my_tool_name");
  });

  it("handles null/undefined gracefully", () => {
    expect(htmlEscape(null)).toBe("");
    expect(htmlEscape(undefined)).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 13. SLA timed_out status (distinct from rejected)
// ──────────────────────────────────────────────────────────────────────────────

describe("SLA timed_out outcome", () => {
  type ApprovalStatus = "pending" | "approved" | "rejected" | "timed_out";

  function computeTimedOut(status: ApprovalStatus): boolean {
    return status === "timed_out";
  }

  it("timed_out is distinct from rejected", () => {
    expect(computeTimedOut("timed_out")).toBe(true);
    expect(computeTimedOut("rejected")).toBe(false);
  });

  it("timed_out is not approved", () => {
    expect(computeTimedOut("approved")).toBe(false);
  });

  it("timed_out is not pending", () => {
    expect(computeTimedOut("pending")).toBe(false);
  });

  it("SLA timeout reason string is not empty", () => {
    const reason = "SLA timeout — no decision recorded within the allowed window";
    expect(reason.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 14. contextType-based resume dispatch
// ──────────────────────────────────────────────────────────────────────────────

describe("contextType-based resume dispatch", () => {
  function resolveDispatch(contextType: string | null, toolName: string): "coordinator_gate" | "tool_gate" | "consequence_gate" | "agentic_loop" {
    const isCoordinator = contextType === "coordinator_gate" || toolName === "galaxy_mind_strategy";
    if (isCoordinator) return "coordinator_gate";
    if (contextType === "consequence_gate") return "consequence_gate";
    if (contextType === "tool_gate") return "tool_gate";
    return "agentic_loop";
  }

  it("dispatches coordinator_gate when contextType is coordinator_gate", () => {
    expect(resolveDispatch("coordinator_gate", "some_tool")).toBe("coordinator_gate");
  });

  it("falls back to coordinator_gate for galaxy_mind_strategy toolName", () => {
    expect(resolveDispatch(null, "galaxy_mind_strategy")).toBe("coordinator_gate");
  });

  it("dispatches tool_gate for tool_gate context", () => {
    expect(resolveDispatch("tool_gate", "send_email")).toBe("tool_gate");
  });

  it("dispatches consequence_gate for consequence_gate context", () => {
    expect(resolveDispatch("consequence_gate", "delete_record")).toBe("consequence_gate");
  });

  it("falls back to agentic_loop when no contextType and non-coordinator tool", () => {
    expect(resolveDispatch(null, "custom_tool")).toBe("agentic_loop");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 15. Action-link reason enforcement
// ──────────────────────────────────────────────────────────────────────────────

describe("Action-link reason enforcement", () => {
  function validateActionLinkBody(body: unknown): { ok: boolean; error?: string } {
    const b = body as Record<string, unknown>;
    if (!b?.token) return { ok: false, error: "token is required" };
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    if (!reason) return { ok: false, error: "reason is required" };
    return { ok: true };
  }

  it("rejects when token is missing", () => {
    expect(validateActionLinkBody({ reason: "ok" }).error).toBe("token is required");
  });

  it("rejects when reason is missing", () => {
    expect(validateActionLinkBody({ token: "tok" }).error).toBe("reason is required");
  });

  it("rejects when reason is blank", () => {
    expect(validateActionLinkBody({ token: "tok", reason: "   " }).error).toBe("reason is required");
  });

  it("accepts valid token and reason", () => {
    expect(validateActionLinkBody({ token: "tok", reason: "Reviewed carefully" }).ok).toBe(true);
  });
});
