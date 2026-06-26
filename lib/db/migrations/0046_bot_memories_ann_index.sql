-- Approximate-nearest-neighbor (HNSW) index for bot memory vector retrieval.
-- Replaces the implicit sequential cosine scan with an index so top-k similarity
-- lookups stay roughly flat as episodic memory grows into the tens of thousands.
-- Non-breaking: additive index only, no column/data changes.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS "bot_memories_embedding_hnsw_idx"
  ON "bot_memories"
  USING hnsw ("embedding" vector_cosine_ops);
