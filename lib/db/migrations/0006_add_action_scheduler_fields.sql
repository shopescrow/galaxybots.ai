ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS action_mode text NOT NULL DEFAULT 'passive';
ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS action_prompt text;
ALTER TABLE background_reports ADD COLUMN IF NOT EXISTS run_status text NOT NULL DEFAULT 'success';
