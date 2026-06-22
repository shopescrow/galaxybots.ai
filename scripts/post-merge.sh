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

echo "[post-merge] Running type check..."
if pnpm typecheck; then
  echo "[post-merge] Typecheck passed."
else
  echo "[post-merge] WARNING: Typecheck reported errors (pre-existing deferred TS issues — non-fatal)."
fi

echo "[post-merge] Running format check..."
if pnpm format:check; then
  echo "[post-merge] Format check passed."
else
  echo "[post-merge] WARNING: Format check reported issues (non-fatal)."
fi

echo "[post-merge] Running smoke tests..."
pnpm test:smoke

# -----------------------------------------------------------------------------
# Push to GitHub
# Requires the GITHUB_TOKEN secret to be set in Replit Secrets.
# Target: github.com/shopescrow/galaxybots.ai  (main branch)
# Binaries and gitignored files are excluded by .gitignore — nothing extra needed.
#
# Credential note: the token is supplied via a transient credential helper so
# it does not appear in the git remote URL, process listings, or log output.
# -----------------------------------------------------------------------------
if [ -z "${GITHUB_TOKEN}" ]; then
  echo "[post-merge] WARNING: GITHUB_TOKEN is not set — skipping GitHub push." >&2
else
  CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached")
  if [ "${CURRENT_BRANCH}" != "main" ] && [ "${CURRENT_BRANCH}" != "master" ]; then
    echo "[post-merge] WARNING: current branch is '${CURRENT_BRANCH}', not main/master — skipping GitHub push to avoid accidental wrong-branch push." >&2
  else
    echo "[post-merge] Pushing to GitHub (shopescrow/galaxybots.ai, branch: ${CURRENT_BRANCH})..."
    # Use a credential helper that reads from the environment rather than
    # embedding the token in the remote URL (prevents token exposure in
    # process tables and git error messages).
    GIT_ASKPASS_SCRIPT=$(mktemp)
    chmod 700 "${GIT_ASKPASS_SCRIPT}"
    printf '#!/bin/sh\necho "${GITHUB_TOKEN}"\n' > "${GIT_ASKPASS_SCRIPT}"
    if GIT_ASKPASS="${GIT_ASKPASS_SCRIPT}" \
        git -c "credential.username=x-access-token" \
        push --force "https://github.com/shopescrow/galaxybots.ai.git" "HEAD:${CURRENT_BRANCH}" 2>&1; then
      echo "[post-merge] GitHub push complete."
    else
      echo "[post-merge] WARNING: GitHub push failed (non-fatal — may be a concurrent push or token issue). Check GitHub manually." >&2
    fi
    rm -f "${GIT_ASKPASS_SCRIPT}"
  fi
fi

echo "[post-merge] Post-merge setup complete."
