CREATE TABLE IF NOT EXISTS partners (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  platform_name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  welcome_message TEXT NOT NULL,
  offer TEXT,
  admin_password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO partners (slug, platform_name, logo_url, primary_color, welcome_message, offer, admin_password, is_active)
VALUES (
  'bingolingo',
  'BingoLingo.ai',
  NULL,
  NULL,
  'Welcome from BingoLingo.ai! As a BingoLingo user, you get exclusive access to GalaxyBots.ai — your Fortune 500 AI executive team. Deploy the same intelligence layer that powers billion-dollar decisions.',
  'BingoLingo partners receive 30 days free on any plan. Your first month is on us.',
  '$2b$10$py97eBCFz4JdXXJXzpIPoeADxzatfs9a0YGSL3.NHQZTX3ZWgzX1q',
  TRUE
) ON CONFLICT (slug) DO NOTHING;
