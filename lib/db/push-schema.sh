#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "[schema-push] Generating migration SQL from schema..."
cd "$SCRIPT_DIR"

rm -rf ./drizzle
npx drizzle-kit generate --config ./drizzle.config.ts 2>&1

SQL_FILE=$(find ./drizzle -name "*.sql" 2>/dev/null | sort | tail -1)

if [ -z "$SQL_FILE" ]; then
  echo "[schema-push] No migration SQL found"
  rm -rf ./drizzle
  node verify-schema-sync.cjs
  exit 0
fi

echo "[schema-push] Applying schema from $SQL_FILE..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$SQL_FILE" 2>&1

rm -rf ./drizzle

echo "[schema-push] Verifying all required tables exist..."
node verify-schema-sync.cjs
VERIFY_EXIT=$?
if [ $VERIFY_EXIT -ne 0 ]; then
  echo "[schema-push] FAILED: required tables are missing after schema push"
  exit 1
fi

echo "[schema-push] Schema push complete."
