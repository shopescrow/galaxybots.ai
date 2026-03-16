CREATE TABLE IF NOT EXISTS knowledge_base_sources (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  sync_schedule TEXT NOT NULL DEFAULT 'daily',
  status TEXT NOT NULL DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  document_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kb_sources_client_id_idx ON knowledge_base_sources(client_id);
CREATE INDEX IF NOT EXISTS kb_sources_source_type_idx ON knowledge_base_sources(source_type);

CREATE TABLE IF NOT EXISTS kb_source_documents (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES knowledge_base_sources(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  external_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  source_url TEXT,
  last_modified TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kb_src_docs_source_id_idx ON kb_source_documents(source_id);
CREATE INDEX IF NOT EXISTS kb_src_docs_client_id_idx ON kb_source_documents(client_id);
CREATE INDEX IF NOT EXISTS kb_src_docs_external_id_idx ON kb_source_documents(external_id);

CREATE TABLE IF NOT EXISTS kb_source_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES kb_source_documents(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES knowledge_base_sources(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kb_src_chunks_document_id_idx ON kb_source_chunks(document_id);
CREATE INDEX IF NOT EXISTS kb_src_chunks_source_id_idx ON kb_source_chunks(source_id);
CREATE INDEX IF NOT EXISTS kb_src_chunks_client_id_idx ON kb_source_chunks(client_id);
