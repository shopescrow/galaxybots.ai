-- Migration: Human Approval Gating hardening columns for pending_approvals
-- Safe to re-run: all statements use IF NOT EXISTS / DO NOTHING patterns.

ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS approval_reason       text,
  ADD COLUMN IF NOT EXISTS context_type          text,
  ADD COLUMN IF NOT EXISTS required_approver_role text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS consequence_risk_score integer,
  ADD COLUMN IF NOT EXISTS confidence_score       integer;

-- escalated_to already existed from the SLA escalation work; guard anyway
ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS escalated_to integer;
