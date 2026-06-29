-- Task #259 addendum: add client_id to golden_prompts for row-level ownership.
-- client_id = NULL  → global/platform prompt (seeded at startup, API read-only)
-- client_id = N     → tenant-owned prompt (only that tenant may mutate/delete)

ALTER TABLE golden_prompts
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS gp_client_id_idx ON golden_prompts (client_id);
