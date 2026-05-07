CREATE TABLE IF NOT EXISTS model_costs (
  id SERIAL PRIMARY KEY,
  model TEXT NOT NULL UNIQUE,
  input_cost_per_token NUMERIC NOT NULL,
  output_cost_per_token NUMERIC NOT NULL,
  context_window NUMERIC NOT NULL DEFAULT '128000',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO model_costs (model, input_cost_per_token, output_cost_per_token, context_window) VALUES
  ('gpt-5.4',          '0.000005',  '0.000015', '128000'),
  ('gpt-4o',           '0.0000025', '0.00001',  '128000'),
  ('gpt-4o-mini',      '0.00000015','0.0000006','128000'),
  ('gpt-4-turbo',      '0.00001',   '0.00003',  '128000'),
  ('claude-sonnet-4-6','0.000003',  '0.000015', '200000')
ON CONFLICT (model) DO NOTHING;
