ALTER TABLE coordinator_weights ADD COLUMN IF NOT EXISTS model_tier text;
ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS model_tier text;
