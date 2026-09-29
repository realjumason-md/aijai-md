# aijai-md

A single-process WhatsApp bot based on the MEGA-MD runtime layout, with aijai-md branding and custom commands.

## Railway deployment

Railway should deploy this repository as one Docker-based service from the repository root.

- Build: `Dockerfile`
- Start: `npm run start:optimized`
- Health check: `/health`

Create a Railway volume mounted at `/data` and attach it to the same Railway
service that runs this bot before redeploying. Railway automatically provides
`RAILWAY_VOLUME_MOUNT_PATH` to the service when the volume is attached, so no
extra storage variable is needed.

For other hosting providers, set `BOT_STORAGE_DIR` to the provider's
persistent disk mount path. Setting `BOT_STORAGE_DIR` without attaching a
volume does not make the directory persistent.

The volume keeps the Baileys session, bot settings, message store, and JSON state across rebuilds and redeployments. Set `SESSION_ID` only when bootstrapping from an existing session; once the session is stored on the volume, later redeployments reuse it without a new pairing code.

### Railway free-tier alternative: encrypted GitHub session backup

If your Railway plan does not include volumes, set these variables on the
Railway service:

```env
SESSION_STORAGE=github
GITHUB_PERSONAL_ACCESS_TOKEN=your-token-with-repository-content-access
GITHUB_SESSION_REPO=realjumason-md/aijai-md
GITHUB_SESSION_BRANCH=bot-session
SESSION_ENCRYPTION_KEY=use-a-long-random-secret
```

Generate `SESSION_ENCRYPTION_KEY` locally with `openssl rand -hex 32` and add
it directly to Railway. Do not send that value in chat or commit it.

The bot stores the Baileys session as an encrypted file on the separate
`bot-session` branch. It restores that file before attempting to pair and
updates it after credential changes. Raw WhatsApp credentials are not stored
in the repository. The GitHub token must be added to Railway as a secret, not
committed to the code.

With either a Railway volume or the encrypted GitHub backup configured, the
bot refuses to start when persistent session storage is unavailable. This is
intentional: it prevents a new WhatsApp pairing from being saved only inside
a disposable container.

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

`.aiswitch <groq|off>` changes the AI state and saves the choice. `.aikey` shows Groq readiness without revealing the API key.

Groq is the only AI provider. Text chats use `GROQ_MODEL` (default `llama-3.3-70b-versatile`) and images use `GROQ_VISION_MODEL` (default `meta-llama/llama-4-scout-17b-16e-instruct`). Image messages and captions are sent to Groq vision; replying to an image with `.ai` also works.

Groups use a separate admin-only command: `.chatbot on` enables automatic AI replies in that WhatsApp group, and `.chatbot off` disables them. The private-chat AI commands do not change group chatbot settings.

Set these variables in the Railway service:

```env
AI_PROVIDER=groq
GROQ_API_KEY=your-groq-key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

`GROQ_API_KEY` is required for AI replies and is never printed by `.aikey`. Do not commit it, put it in a public file, or send it in chat.
