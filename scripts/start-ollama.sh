#!/usr/bin/env bash
# Start Ollama and ensure the default model is pulled.
# This script is used by the Ollama workflow so provisioning is
# deterministic — the service and model are always available on boot.

set -euo pipefail

OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0:11434}"
DEFAULT_MODEL="${OLLAMA_DEFAULT_MODEL:-llama3.2:3b}"

export OLLAMA_HOST

echo "[start-ollama] Starting ollama serve on ${OLLAMA_HOST}..."
ollama serve &
OLLAMA_PID=$!

# Wait until the API is responsive (up to 30 s)
echo "[start-ollama] Waiting for Ollama API to become ready..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1; then
    echo "[start-ollama] Ollama is ready."
    break
  fi
  sleep 1
done

# Pull the default model if it is not already present locally
if ollama list 2>/dev/null | grep -q "^${DEFAULT_MODEL}"; then
  echo "[start-ollama] Model ${DEFAULT_MODEL} already present — skipping pull."
else
  echo "[start-ollama] Pulling model ${DEFAULT_MODEL}..."
  ollama pull "${DEFAULT_MODEL}"
  echo "[start-ollama] Model ${DEFAULT_MODEL} pulled successfully."
fi

echo "[start-ollama] Ollama ready. Model: ${DEFAULT_MODEL}"

# Keep the process in the foreground so the workflow stays alive
wait "$OLLAMA_PID"
