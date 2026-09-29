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

Attach the volume to the same Railway service that runs this bot before
redeploying. Setting `BOT_STORAGE_DIR` without attaching a volume does not
make the directory persistent.

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

`.aiswitch <ollama|off>` changes the local AI state and saves the choice. `.aikey` shows Ollama readiness without revealing secrets.

- `ollama` — uses an Ollama server you run locally or at `OLLAMA_BASE_URL`; no API key is required.

Ollama is the only AI provider. Text chats use `OLLAMA_MODEL` (default `llama3.2:3b`) and images use `OLLAMA_VISION_MODEL` (default `qwen2.5vl:3b`). Image messages and captions are sent to the local vision model; replying to an image with `.ai` also works.

Groups use a separate admin-only command: `.chatbot on` enables automatic AI replies in that WhatsApp group, and `.chatbot off` disables them. The private-chat AI commands do not change group chatbot settings.

Run Ollama locally and pull the models before starting the bot:

```bash
ollama serve
ollama pull llama3.2:3b
ollama pull qwen2.5vl:3b
```

The bot connects to `http://127.0.0.1:11434` by default. Set these variables when the Ollama server is elsewhere:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_VISION_MODEL=qwen2.5vl:3b
```
