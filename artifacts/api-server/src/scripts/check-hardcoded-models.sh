#!/usr/bin/env bash
#
# CI guard: fail if any service file in artifacts/api-server/src/services/
# contains a hardcoded model-name string used as an ACTUAL routing decision.
#
# The guard matches patterns that indicate a routing decision, NOT lookup-table
# keys.  Specifically it looks for:
#   - model: "gpt-..."        — direct model assignment in an LLM call
#   - return "gpt-..."        — function returning a hardcoded model name
#   - MODEL = "gpt-..."       — module-level model constant
#   - process.env.X ?? "gpt-..." — env-var fallback to a hardcoded name
#
# (Record/map entries like  "gpt-5.4": 128_000  do NOT match these patterns.)
#
# Exemptions (per-file, applied to any matched line):
#   - model-router.ts         — IS the router (defines capability chains)
#   - model-fallback.ts       — IS the fallback engine
#   - llm-usage.ts            — cost-pricing lookup table
#   - scaling-telemetry.ts    — cost-pricing lookup table
#   - tree-cost-estimator.ts  — cost-estimation lookup table
#   - *.test.ts / *.smoke.test.ts — unit and smoke tests
#   - Any line containing: model-router-lint-ignore
#
# Usage:
#   bash artifacts/api-server/src/scripts/check-hardcoded-models.sh
#   Exit code 0 = clean, 1 = violations found.

set -euo pipefail

SERVICES_DIR="artifacts/api-server/src/services"

# Targeted patterns — only routing decisions, not Record key literals.
PATTERNS=(
  'model:\s*"gpt-[0-9]'
  'model:\s*"claude-'
  'model:\s*"gemini-'
  'model:\s*"glm-[0-9]'
  'return\s*"gpt-[0-9]'
  'return\s*"claude-'
  '[A-Z_]*MODEL\s*=\s*"gpt-[0-9]'
  '[A-Z_]*MODEL\s*=\s*"claude-'
  '\?\?\s*"gpt-[0-9]'
  '\?\?\s*"claude-'
)

EXEMPT_FILENAMES=(
  "model-router.ts"
  "model-fallback.ts"
  "llm-usage.ts"
  "scaling-telemetry.ts"
  "tree-cost-estimator.ts"
)

VIOLATIONS=0
VIOLATION_LINES=""

for PATTERN in "${PATTERNS[@]}"; do
  while IFS= read -r line; do
    [ -z "$line" ] && continue

    SKIP=0

    for EXEMPT in "${EXEMPT_FILENAMES[@]}"; do
      if [[ "$line" == *"$EXEMPT"* ]]; then
        SKIP=1
        break
      fi
    done

    if [[ "$line" == *".test.ts"* ]]; then
      SKIP=1
    fi

    if [[ "$line" == *"model-router-lint-ignore"* ]]; then
      SKIP=1
    fi

    if [[ $SKIP -eq 0 ]]; then
      VIOLATIONS=$((VIOLATIONS + 1))
      VIOLATION_LINES="${VIOLATION_LINES}  ${line}\n"
    fi
  done < <(grep -rPn --include="*.ts" "$PATTERN" "$SERVICES_DIR" 2>/dev/null || true)
done

if [[ $VIOLATIONS -gt 0 ]]; then
  echo "ERROR: Hardcoded model names detected in service files."
  echo "Use resolveCapability(ModelCapability.XXX) from ai-safety/model-router instead."
  echo ""
  echo "Violations:"
  echo -e "$VIOLATION_LINES"
  echo "Tip: add '// model-router-lint-ignore' comment to exempt a specific line."
  exit 1
fi

echo "OK: No hardcoded model routing decisions found in service files."
exit 0
