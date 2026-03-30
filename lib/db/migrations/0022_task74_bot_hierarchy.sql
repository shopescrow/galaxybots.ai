-- Task #74: Bot operating hierarchy, autonomous delegation & mission playbooks

-- Add rank to bots
ALTER TABLE bots ADD COLUMN IF NOT EXISTS rank TEXT NOT NULL DEFAULT 'analyst';

-- Seed director rank for C-suite bots
UPDATE bots SET rank = 'director'
WHERE LOWER(title) LIKE '%chief%'
   OR LOWER(title) LIKE '%ceo%'
   OR LOWER(title) LIKE '%cfo%'
   OR LOWER(title) LIKE '%cmo%'
   OR LOWER(title) LIKE '%coo%'
   OR LOWER(title) LIKE '%cto%'
   OR LOWER(title) LIKE '%cso%'
   OR LOWER(title) LIKE '%president%'
   OR LOWER(name) LIKE '%ceo%'
   OR LOWER(name) LIKE '%cfo%'
   OR LOWER(name) LIKE '%cmo%'
   OR LOWER(name) LIKE '%coo%'
   OR LOWER(name) LIKE '%cto%';

UPDATE bots SET rank = 'manager'
WHERE rank = 'analyst'
  AND (LOWER(title) LIKE '%director%'
    OR LOWER(title) LIKE '%head of%'
    OR LOWER(title) LIKE '%vp %'
    OR LOWER(title) LIKE '%vice president%');

-- Add governance_mode to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS governance_mode TEXT NOT NULL DEFAULT 'approval_all';

-- Create bot_messages table
CREATE TABLE IF NOT EXISTS bot_messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES task_sessions(id) ON DELETE CASCADE,
  from_bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL,
  from_bot_name TEXT,
  to_bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL,
  to_bot_name TEXT,
  task_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'assignment',
  payload JSONB,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create mission_playbooks table
CREATE TABLE IF NOT EXISTS mission_playbooks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  is_built_in BOOLEAN NOT NULL DEFAULT false,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed 5 built-in playbooks
INSERT INTO mission_playbooks (name, description, steps, is_built_in, category)
SELECT * FROM (VALUES
  (
    'Q4 Strategic Plan',
    'Full Q4 planning cycle: market analysis, financial modeling, and execution roadmap synthesized into a board-ready plan.',
    '[{"order":1,"botRole":"CEO","objective":"Kick off Q4 planning and define top 3 strategic priorities","reportTo":"CFO"},{"order":2,"botRole":"CMO","objective":"Deliver market analysis: competitive landscape, demand signals, and growth opportunities for Q4","reportTo":"CEO"},{"order":3,"botRole":"CFO","objective":"Model Q4 financial scenarios based on CMO market input. Deliver revenue targets, cost plan, and EBITDA projection","reportTo":"CEO"},{"order":4,"botRole":"COO","objective":"Build Q4 execution roadmap: initiatives, owners, milestones, and resource requirements","reportTo":"CEO"},{"order":5,"botRole":"CEO","objective":"Synthesize all inputs into a board-ready Q4 strategic plan with executive summary"}]'::jsonb,
    true,
    'strategy'
  ),
  (
    'New Market Entry',
    'Structured analysis and go-to-market plan for entering a new vertical or geography.',
    '[{"order":1,"botRole":"CMO","objective":"Analyze the target market: TAM, key segments, buyer personas, and competitive set","reportTo":"CEO"},{"order":2,"botRole":"CFO","objective":"Model market entry economics: investment required, break-even timeline, 3-year revenue projection","reportTo":"CEO"},{"order":3,"botRole":"COO","objective":"Define operational requirements for market entry: hiring, logistics, partnerships, and compliance","reportTo":"CEO"},{"order":4,"botRole":"CEO","objective":"Synthesize into a market entry recommendation deck with go/no-go criteria and phased launch plan"}]'::jsonb,
    true,
    'strategy'
  ),
  (
    'Fundraising Prep',
    'Prepare all materials and data room content for a fundraising round.',
    '[{"order":1,"botRole":"CFO","objective":"Build financial model and data room: P&L, cap table, runway analysis, and investor KPIs","reportTo":"CEO"},{"order":2,"botRole":"CMO","objective":"Produce market narrative: TAM validation, competitive positioning, and growth story for investor deck","reportTo":"CEO"},{"order":3,"botRole":"COO","objective":"Document operational metrics: team structure, key hires, operational milestones achieved and planned","reportTo":"CEO"},{"order":4,"botRole":"CEO","objective":"Compile investor pitch deck and executive summary, incorporating all departmental inputs"}]'::jsonb,
    true,
    'finance'
  ),
  (
    'Competitive Response Brief',
    'Rapid intelligence and response strategy when a competitor makes a major move.',
    '[{"order":1,"botRole":"CMO","objective":"Gather competitive intelligence: what the competitor announced, affected segments, initial market reaction","reportTo":"CEO"},{"order":2,"botRole":"CFO","objective":"Assess financial impact: revenue at risk, pricing implications, and budget needed for response","reportTo":"CEO"},{"order":3,"botRole":"COO","objective":"Identify operational levers: product acceleration, partnership options, or service differentiation","reportTo":"CEO"},{"order":4,"botRole":"CEO","objective":"Draft a 48-hour competitive response brief with recommended actions and owner assignments"}]'::jsonb,
    true,
    'strategy'
  ),
  (
    'New Client Onboarding',
    'Structured onboarding sequence ensuring a new client is fully activated and seeing value within 30 days.',
    '[{"order":1,"botRole":"COO","objective":"Prepare onboarding checklist: accounts set up, integrations connected, team access granted","reportTo":"CEO"},{"order":2,"botRole":"CMO","objective":"Deliver welcome briefing: client goals, KPIs to track, and 30-day success metrics","reportTo":"COO"},{"order":3,"botRole":"CFO","objective":"Confirm billing setup, contract terms summary, and invoice schedule for client records","reportTo":"COO"},{"order":4,"botRole":"COO","objective":"Schedule 7-day and 30-day check-in calls. Draft first weekly intelligence briefing for client"}]'::jsonb,
    true,
    'operations'
  )
) AS v(name, description, steps, is_built_in, category)
WHERE NOT EXISTS (SELECT 1 FROM mission_playbooks WHERE is_built_in = true);

INSERT INTO _migrations(name) VALUES ('0022_task74_bot_hierarchy.sql') ON CONFLICT DO NOTHING;
