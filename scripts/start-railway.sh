#!/usr/bin/env bash
set -Eeuo pipefail

# Railway runs the WhatsApp bot only. Ollama must be hosted separately and
# exposed through OLLAMA_BASE_URL (and OLLAMA_API_KEY when required).
exec npm run start:optimized