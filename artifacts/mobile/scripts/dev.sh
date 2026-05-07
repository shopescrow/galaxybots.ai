#!/usr/bin/env bash
set -e

pnpm exec expo start --localhost --port "$PORT" &
METRO_PID=$!

echo "[prewarm] Waiting for Metro on port $PORT..."
until curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; do
  sleep 1
done
echo "[prewarm] Metro ready — extracting real bundle URL from HTML..."

# Extract the exact bundle URL the browser will request (full pnpm path + all params)
BUNDLE_URL=$(curl -s "http://localhost:$PORT/" \
  | grep -o 'src="[^"]*\.bundle[^"]*"' \
  | sed 's/src="//;s/"//')

if [ -z "$BUNDLE_URL" ]; then
  echo "[prewarm] Could not extract bundle URL — skipping pre-warm"
else
  echo "[prewarm] Building bundle (blocking until done): ${BUNDLE_URL:0:80}..."
  # Synchronous: block here until Metro finishes compiling the real bundle
  curl -s "http://localhost:$PORT${BUNDLE_URL}" \
    -o /dev/null --max-time 180
  echo "[prewarm] Web bundle ready — first request will be instant."
fi

wait "$METRO_PID"
