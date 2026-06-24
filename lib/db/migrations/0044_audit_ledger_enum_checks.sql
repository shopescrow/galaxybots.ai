-- Migration 0044: Add CHECK constraints on galaxy_audit_ledger engine and decision_type columns
-- These enforce that only known values can be persisted, strengthening immutable audit guarantees.

ALTER TABLE galaxy_audit_ledger
  ADD CONSTRAINT galaxy_audit_ledger_engine_check
    CHECK (engine IN (
      'coordinator', 'conductor', 'arbitrator', 'circuit_breaker', 'budget_guard'
    ));

ALTER TABLE galaxy_audit_ledger
  ADD CONSTRAINT galaxy_audit_ledger_decision_type_check
    CHECK (decision_type IN (
      'role_assignment', 'strategy_selection', 'arbitration', 'suppression',
      'budget_override', 'circuit_open', 'circuit_close', 'confidence_score',
      'human_approval_required', 'human_approval_outcome', 'outcome'
    ));
