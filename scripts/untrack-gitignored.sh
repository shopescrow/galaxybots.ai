#!/usr/bin/env bash
# untrack-gitignored.sh
# Removes already-tracked files from the git index without deleting them from disk.
# Run once from the repo root: bash scripts/untrack-gitignored.sh

set -euo pipefail

echo "==> Untracking directories..."
git rm --cached -r --ignore-unmatch attached_assets/ exports/ reports/ .agents/

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

echo "==> Staging .gitignore..."
git add .gitignore

echo ""
echo "==> Files removed from index. Now committing..."
git commit -m "chore: untrack gitignored files from index

- Removed attached_assets/, exports/, reports/, .agents/ from index
- Removed large binaries (PDFs, PPTX) from index
- Removed leftover debris files from index
Files remain on disk; .gitignore prevents future tracking."

echo ""
echo "Done. Run 'git ls-files attached_assets/' to confirm they are gone."
