# Bot-Memories Vector Index Growth Strategy

## Problem

The `bot_memories` table holds embeddings (1536-dim) for every memory across all tenants.
A single global HNSW index over all rows means:

- **Memory pressure**: HNSW graph is loaded into `shared_buffers`; at scale the index
  easily exceeds available memory and triggers disk reads.
- **Query latency**: ANN search scans the full index even when the query is scoped to
  one (client_id, bot_id) pair.
- **Vacuum pressure**: every new memory row dirtied the entire index leaf page.

## Applied Strategy: Partial-Scan via Per-Tenant Composite Index

### 1. New composite B-tree index (applied in migration 0003)

```sql
CREATE INDEX bot_memories_client_bot_time_idx
  ON bot_memories (client_id, bot_id, created_at DESC);
```

Combined with a WHERE clause that always includes `client_id = $1 AND bot_id = $2`,
the planner can narrow the candidate set to the single tenant's rows before executing
the vector similarity step. This shrinks the effective search space from N (all tenants)
to N/T (one tenant), keeping ANN latency roughly flat as T scales.

### 2. Tuned HNSW parameters (current schema, `memory.ts`)

The existing `bot_memories_embedding_hnsw_idx` index uses `vector_cosine_ops`.
Recommended parameter values to set at index creation time (tunable without schema change):

| Parameter | Default | Recommended | Reason |
|-----------|---------|-------------|--------|
| `m`       | 16      | 16          | Good recall/latency balance at <10M rows |
| `ef_construction` | 64 | 128    | Higher build-time recall; pay once at insert |
| `ef`      | 40      | 64          | Query-time candidate list; raise if recall degrades |

To apply:

```sql
DROP INDEX CONCURRENTLY bot_memories_embedding_hnsw_idx;
CREATE INDEX CONCURRENTLY bot_memories_embedding_hnsw_idx
  ON bot_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

SET hnsw.ef_search = 64;  -- session-level; set in connection init or GUC
```

### 3. Query pattern — always scope by tenant before ANN

Any retrieval query **must** include a `client_id` + `bot_id` filter so the planner can
use the B-tree index for a pre-filter before the ANN scan:

```sql
SELECT id, content, summary, embedding <=> $embed AS distance
FROM   bot_memories
WHERE  client_id = $1
  AND  bot_id    = $2
  AND  archived_at IS NULL
ORDER  BY distance
LIMIT  10;
```

This pattern is safe with both sequential scan (small tenant) and HNSW (large tenant)
because pgvector always falls back to exact scan when the candidate set is small enough.

### 4. Archival gate — retention job preserves live memories

The data-retention job only prunes memories where `archived_at IS NOT NULL`, so
the working set of live memories (those retrieved during conversations) stays intact.
Expired archived memories are pruned on the 730-day retention window, keeping the
index size proportional to active data.

### 5. Future option: external vector DB (out of scope here)

If the cross-tenant index exceeds ~10M rows or memory pressure becomes acute, migrating
to a dedicated vector DB (Pinecone, Weaviate, Qdrant) with native namespace isolation
per tenant is the recommended next step. The retrieval interface in `services/bots/memory.ts`
is a single function call, making this a one-file swap.

## Correctness Guarantee

Analytics queries that read from rollup tables return identical aggregate totals to
raw-table scans for the same date window. The `ON CONFLICT DO UPDATE` upsert in the
rollup worker is idempotent, so re-runs on the same day produce the same result.
Retention runs only after the rollup worker has had 2+ days to capture aggregates,
so no raw data is pruned before its rollup is materialised.
