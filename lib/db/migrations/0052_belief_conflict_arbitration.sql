-- Migration: belief conflict arbitration tables & columns
-- Task #324 — Semantic belief conflict resolution

-- 1. knowledge_transfers: add soft-archival timestamp so losing beliefs are
--    never hard-deleted (provenance always inspectable via archived_at).
ALTER TABLE knowledge_transfers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 2. belief_conflicts: new table that records every detected semantic
--    contradiction between agent beliefs, pending LLM-mediated arbitration.
CREATE TABLE IF NOT EXISTS belief_conflicts (
  id                  SERIAL PRIMARY KEY,
  -- The incoming knowledge transfer whose distilled_belief triggered the conflict.
  source_belief_id    INTEGER REFERENCES knowledge_transfers(id) ON DELETE SET NULL,
  -- The incumbent applied knowledge transfer that was contradicted.
  target_belief_id    INTEGER REFERENCES knowledge_transfers(id) ON DELETE SET NULL,
  source_bot_id       INTEGER REFERENCES bots(id) ON DELETE SET NULL,
  target_bot_id       INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  client_id           INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  task_category       TEXT,
  -- Verbatim belief texts captured at conflict time (survive transfer deletion).
  source_belief_text  TEXT NOT NULL,
  target_belief_text  TEXT NOT NULL,
  source_confidence   REAL NOT NULL,
  target_confidence   REAL NOT NULL,
  -- Cosine similarity between the two belief embeddings at detection time (0..1).
  -- Higher value means the beliefs are on the same topic but contradict each other.
  semantic_similarity REAL,
  -- contradiction | partial_overlap | context_dependent
  conflict_type       TEXT NOT NULL DEFAULT 'contradiction',
  -- pending | resolved | human_review
  resolution_status   TEXT NOT NULL DEFAULT 'pending',
  -- Arbitration outputs (populated by the background job after LLM resolution).
  synthesized_belief  TEXT,
  dissenting_note     TEXT,
  -- merged | first_wins | second_wins | context_dependent
  resolution_type     TEXT,
  -- Full chain-of-thought reasoning from the arbitration LLM call.
  arbitration_reasoning TEXT,
  -- Condition tag when resolution_type = 'context_dependent'.
  condition_tag       TEXT,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS belief_conflicts_target_bot_id_idx
  ON belief_conflicts(target_bot_id);
CREATE INDEX IF NOT EXISTS belief_conflicts_resolution_status_idx
  ON belief_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS belief_conflicts_created_at_idx
  ON belief_conflicts(created_at);
CREATE INDEX IF NOT EXISTS belief_conflicts_task_category_idx
  ON belief_conflicts(task_category);
