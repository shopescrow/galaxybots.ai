-- Task #163: Galaxy Model Independence — Ollama local tier
  -- Add model_tier column to llm_usage_log
  ALTER TABLE llm_usage_log ADD COLUMN IF NOT EXISTS model_tier TEXT;

  -- Create ollama_config table
  CREATE TABLE IF NOT EXISTS ollama_config (
    id SERIAL PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT true,
    model TEXT NOT NULL DEFAULT 'llama3.2:3b',
    host TEXT NOT NULL DEFAULT 'localhost:11434',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  