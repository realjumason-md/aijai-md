#!/usr/bin/env bash
set -Eeuo pipefail

model="${OLLAMA_MODEL:-llama3.2:3b}"
ollama serve > /tmp/ollama.log 2>&1 &
ollama_pid=$!

cleanup() {
    kill "$ollama_pid" 2>/dev/null || true
    wait "$ollama_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ready=false
for _ in $(seq 1 120); do
    if curl --fail --silent http://127.0.0.1:11434/api/tags >/dev/null; then
        ready=true
        break
    fi
    if ! kill -0 "$ollama_pid" 2>/dev/null; then
        cat /tmp/ollama.log >&2 || true
        echo "Ollama stopped before becoming ready." >&2
        exit 1
    fi
    sleep 1
done

if [ "$ready" != true ]; then
    cat /tmp/ollama.log >&2 || true
    echo "Ollama did not become ready within 120 seconds." >&2
    exit 1
fi

if ! ollama list | awk 'NR > 1 { print $1 }' | grep --fixed-strings --line-regexp --quiet "$model"; then
    echo "Pulling Ollama model $model..."
    ollama pull "$model"
fi

echo "Ollama is ready with model $model."
exec npm run start:optimized