#!/usr/bin/env bash
set -e

pnpm exec expo start --localhost --port "$PORT" &
METRO_PID=$!

echo "[prewarm] Waiting for Metro on port $PORT..."
until curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; do
  sleep 1
done
echo "[prewarm] Metro ready — pre-warming web bundle in background..."

curl -s \
  "http://localhost:$PORT/index.bundle?platform=web&dev=true&hot=false&minify=false" \
  -o /dev/null --max-time 120 &

wait "$METRO_PID"
