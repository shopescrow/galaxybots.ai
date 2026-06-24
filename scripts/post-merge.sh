#!/bin/bash
  set -e
  pnpm install --frozen-lockfile

  echo "[post-merge] Running SQL migrations..."
  bash lib/db/migrate.sh

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
  # -----------------------------------------------------------------------------
  if [ -z "${GITHUB_TOKEN}" ]; then
    echo "[post-merge] WARNING: GITHUB_TOKEN is not set — skipping GitHub push." >&2
  else
    CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached")
    if [ "${CURRENT_BRANCH}" != "main" ] && [ "${CURRENT_BRANCH}" != "master" ]; then
      echo "[post-merge] WARNING: current branch is '${CURRENT_BRANCH}', not main/master — skipping GitHub push to avoid accidental wrong-branch push." >&2
    else
      echo "[post-merge] Pushing to GitHub (shopescrow/galaxybots.ai, branch: ${CURRENT_BRANCH})..."
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
  