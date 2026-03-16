#!/bin/bash
set -e
pnpm install --frozen-lockfile
bash lib/db/migrate.sh
