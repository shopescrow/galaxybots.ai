#!/usr/bin/env bash
# untrack-gitignored.sh
# Removes already-tracked files from the git index without deleting them from disk.
# Run once from the repo root: bash scripts/untrack-gitignored.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# Preflight: require a clean working tree so nothing unrelated gets swept in.
# ---------------------------------------------------------------------------
if ! git diff --cached --quiet; then
  echo "ERROR: There are already-staged changes in the index."
  echo "       Commit or stash them before running this script."
  exit 1
fi

if ! git diff --quiet; then
  echo "WARNING: You have unstaged working-tree changes."
  read -r -p "Continue anyway? [y/N] " confirm
  if [[ "${confirm,,}" != "y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Untrack directories
# ---------------------------------------------------------------------------
echo "==> Untracking directories..."
git rm --cached -r --ignore-unmatch \
  attached_assets/ \
  exports/ \
  reports/ \
  .agents/

# ---------------------------------------------------------------------------
# Untrack root-level files
# ---------------------------------------------------------------------------
echo "==> Untracking root-level files..."
git rm --cached --ignore-unmatch \
  "GalaxyBots_5Year_Plan_2026-2030.pdf" \
  "GalaxyBots_5Year_Plan_2026-2030.pptx" \
  "GalaxyBots-New-User-Guide.pdf" \
  "conflict_block.txt" \
  "resolution.txt" \
  "part1.txt" \
  "part2.txt" \
  "7lawn11_autonomous_operations_consulting_report.md"

# ---------------------------------------------------------------------------
# Stage .gitignore only if it has unstaged changes (it may already be clean)
# ---------------------------------------------------------------------------
if ! git diff --quiet -- .gitignore; then
  echo "==> Staging updated .gitignore..."
  git add .gitignore
fi

# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------
echo ""
echo "==> Committing removal from index..."
git commit -m "chore: untrack gitignored files from index

- Removed attached_assets/, exports/, reports/, .agents/ from index
- Removed large binaries (PDFs, PPTX) from index
- Removed leftover debris files from index
Files remain on disk; .gitignore prevents future tracking."

# ---------------------------------------------------------------------------
# Post-run verification
# ---------------------------------------------------------------------------
echo ""
echo "==> Verifying removal (all should be empty)..."
for target in \
    "attached_assets/" \
    "exports/" \
    "reports/" \
    ".agents/" \
    "GalaxyBots_5Year_Plan_2026-2030.pdf" \
    "GalaxyBots_5Year_Plan_2026-2030.pptx" \
    "GalaxyBots-New-User-Guide.pdf" \
    "conflict_block.txt" \
    "resolution.txt" \
    "part1.txt" \
    "part2.txt" \
    "7lawn11_autonomous_operations_consulting_report.md"; do
  count=$(git ls-files "$target" | wc -l)
  if [ "$count" -eq 0 ]; then
    echo "  OK  $target"
  else
    echo "  FAIL $target (${count} file(s) still tracked)"
  fi
done

echo ""
echo "Done. Files remain on disk but are no longer tracked by git."
