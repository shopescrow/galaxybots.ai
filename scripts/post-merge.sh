#!/bin/bash
set -e
pnpm install --frozen-lockfile

bash lib/db/migrate.sh

SCHEMA_CHANGED=$(git diff HEAD~1 --name-only -- lib/db/src/schema/ 2>/dev/null || echo "check")
if [ -z "$SCHEMA_CHANGED" ] && git log --oneline HEAD~1..HEAD --format="%H" 2>/dev/null | head -1 > /dev/null 2>&1; then
  MERGE_BASE=$(git merge-base HEAD~1 HEAD 2>/dev/null || echo "")
  if [ -n "$MERGE_BASE" ]; then
    SCHEMA_CHANGED=$(git diff "$MERGE_BASE" HEAD --name-only -- lib/db/src/schema/ 2>/dev/null || echo "")
  fi
fi

if [ -n "$SCHEMA_CHANGED" ]; then
  echo "[post-merge] Schema files changed — running schema push..."
  echo "$SCHEMA_CHANGED"
  pnpm --filter @workspace/db run push-force

  echo "[post-merge] Verifying critical tables exist..."
  if node lib/db/verify-schema-sync.cjs; then
    echo "[post-merge] All expected tables verified."
  else
    echo "[post-merge] WARNING: Some expected tables are missing after schema push!"
    echo "[post-merge] Run 'pnpm --filter @workspace/db push' manually to investigate."
  fi
else
  echo "[post-merge] No schema changes detected — skipping schema push."
fi
