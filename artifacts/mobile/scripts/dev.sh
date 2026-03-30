#!/usr/bin/env bash
set -e

pnpm exec expo start --localhost --port "$PORT" &
METRO_PID=$!

echo "[prewarm] Waiting for Metro on port $PORT..."
until curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; do
  sleep 1
done
echo "[prewarm] Metro ready — building web bundle (blocking until done)..."

# Synchronous: block here until the bundle is fully compiled.
# Uses the real Expo Router entry point so Metro caches the right bundle.
curl -s \
  "http://localhost:$PORT/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&minify=false" \
  -o /dev/null --max-time 180

echo "[prewarm] Web bundle ready — first request will be instant."

wait "$METRO_PID"
