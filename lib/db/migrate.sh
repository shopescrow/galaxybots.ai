#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

psql "$DATABASE_URL" -c "
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);" 2>/dev/null

for f in "$MIGRATIONS_DIR"/*.sql; do
  if [ -f "$f" ]; then
    MIGRATION_NAME="$(basename "$f")"
    ALREADY_APPLIED=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM _migrations WHERE name = '$MIGRATION_NAME';")
    if [ "$ALREADY_APPLIED" = "0" ]; then
      echo "Applying migration: $MIGRATION_NAME"
      psql "$DATABASE_URL" -f "$f"
      psql "$DATABASE_URL" -c "INSERT INTO _migrations (name) VALUES ('$MIGRATION_NAME');"
    else
      echo "Skipping (already applied): $MIGRATION_NAME"
    fi
  fi
done

echo "All migrations applied."
