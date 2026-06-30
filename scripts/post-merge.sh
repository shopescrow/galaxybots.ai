#!/bin/bash
  set -e

  echo "[post-merge] Installing dependencies..."
  pnpm install --frozen-lockfile

  echo "[post-merge] Running SQL migrations..."
  bash lib/db/migrate.sh

  # Push to GitHub
  if [ -z "${GITHUB_TOKEN}" ]; then
    echo "[post-merge] WARNING: GITHUB_TOKEN is not set — skipping GitHub push." >&2
  else
    CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached")
    if [ "${CURRENT_BRANCH}" != "main" ] && [ "${CURRENT_BRANCH}" != "master" ]; then
      echo "[post-merge] WARNING: current branch is '${CURRENT_BRANCH}', not main/master — skipping GitHub push." >&2
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
        echo "[post-merge] WARNING: GitHub push failed (non-fatal)." >&2
      fi
      rm -f "${GIT_ASKPASS_SCRIPT}"
    fi
  fi

  echo "[post-merge] Post-merge setup complete."
  