CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base_documents (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kb_documents_client_id_idx ON knowledge_base_documents(client_id);

CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES knowledge_base_documents(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kb_chunks_document_id_idx ON knowledge_base_chunks(document_id);
CREATE INDEX IF NOT EXISTS kb_chunks_client_id_idx ON knowledge_base_chunks(client_id);
