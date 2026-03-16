#!/bin/bash
set -e
pnpm install --frozen-lockfile
bash lib/db/migrate.sh
bash lib/db/push-schema.sh
