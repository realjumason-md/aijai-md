# aijai-md

A single-process WhatsApp bot based on the MEGA-MD runtime layout, with aijai-md branding and custom commands.

## Railway deployment

Railway should deploy this repository as one Docker-based service from the repository root.

- Build: `Dockerfile`
- Start: `npm run start:optimized`
- Health check: `/health`

Create a Railway volume mounted at `/data` and set:

```env
BOT_STORAGE_DIR=/data
```

The volume keeps the Baileys session, bot settings, message store, and JSON state across rebuilds and redeployments. Set `SESSION_ID` only when bootstrapping from an existing session; once the session is stored on the volume, later redeployments reuse it without a new pairing code.

The bot does not watch source files in production. Use `.updateplugins` for live plugin-only changes; full source changes should be deployed normally. The Railway service is configured to restart automatically if the process exits, while the mounted volume keeps the WhatsApp session available to the new process.

For a new connection, open the Railway service URL and use the **Connect WhatsApp** form to enter your full number with country code. The pairing code is displayed on that page and is no longer written to Railway logs.

Optional variables for a new connection:

```env
OWNER_NUMBER=256706106326
PAIRING_NUMBER=256706106326
```

Set `PAIRING_NUMBER` only if you want the service to request a code automatically at startup. Otherwise, leave it unset and use the web form.

## Live plugin updates

The owner can run:

```text
.updateplugins
```

This downloads the current plugins from the configured GitHub branch, writes them atomically, and reloads the command registry without restarting the WhatsApp connection. To update selected plugins only:

```text
.updateplugins menu echo
```

The command is owner-only. `PLUGIN_REPO` and `PLUGIN_BRANCH` can override the default source.

## Optional runtime settings

- `MEMORY_RESTART_MB` enables an emergency self-restart threshold. It is disabled by default so normal plugin reloads do not take the bot offline.
- `PLUGIN_WATCH=true` enables filesystem plugin watching in production. Leave it unset for stable deployments.

## AI commands

Use `.ai <question>` for a direct AI request. `.aion`, `.aioff`, `.aionall`, and `.aioffall` work only in one-to-one chats. `.aion` enables automatic AI replies in the current private chat, and `.aioff` disables them there. `.aionall` enables automatic AI replies for all direct messages, while `.aioffall` disables them globally. The latest private-chat setting command takes precedence: a global command clears older per-chat overrides, and a later per-chat command overrides the global setting for that chat.

`.aiswitch <provider>` changes the active provider and saves the choice. `.aikey` shows provider readiness without revealing any secret. Keyless options are:

- `ollama` — uses an Ollama server you run locally or at `OLLAMA_BASE_URL`; no API key is required.
- `duckduckgo` — performs a keyless DuckDuckGo lookup. It is a search/answer source, not a generative chat model.

`auto` prefers configured key-based providers, then Ollama when `OLLAMA_BASE_URL` or `OLLAMA_MODEL` is set, and finally DuckDuckGo. The existing `groq`, `gemini`, `openai`, and `xai` providers remain available when their keys are configured.

Groups use a separate admin-only command: `.chatbot on` enables automatic AI replies in that WhatsApp group, and `.chatbot off` disables them. The private-chat AI commands do not change group chatbot settings.

Configure one supported provider in Railway:

```env
AI_PROVIDER=groq
GROQ_API_KEY=...
```

Supported providers are `auto`, `ollama`, `duckduckgo`, `groq`, `gemini`, `openai`, and `xai`. `AI_MODEL` is optional and overrides the provider default.
