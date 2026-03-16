CREATE TABLE IF NOT EXISTS marketplace_templates (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  industry_tags JSONB DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'public',
  source_data JSONB NOT NULL,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  author_name TEXT,
  install_count INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_templates_type_idx ON marketplace_templates(type);
CREATE INDEX IF NOT EXISTS marketplace_templates_category_idx ON marketplace_templates(category);
CREATE INDEX IF NOT EXISTS marketplace_templates_status_idx ON marketplace_templates(status);
CREATE INDEX IF NOT EXISTS marketplace_templates_author_idx ON marketplace_templates(author_user_id);

CREATE TABLE IF NOT EXISTS marketplace_installs (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES marketplace_templates(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_installs_template_idx ON marketplace_installs(template_id);
CREATE INDEX IF NOT EXISTS marketplace_installs_user_idx ON marketplace_installs(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_installs_unique_idx ON marketplace_installs(template_id, user_id);
