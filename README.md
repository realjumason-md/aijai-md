# aijai-md

**aijai-md** is a self-hosted, multi-device WhatsApp bot built with Baileys. It
loads commands from small JavaScript plugins and includes a browser-based
connection page, persistent session options, and optional Groq-powered AI
features.

## Disclaimer

Use this project responsibly and in accordance with WhatsApp's terms and the
laws that apply to you. Obtain permission before adding the bot to chats or
sending messages, and keep account credentials, session data, and API keys
private. WhatsApp may restrict accounts that violate its terms.

## Features

- **Plugin commands:** Commands are loaded from `plugins/` and grouped by
  category. Use `.menu` to see the commands available in the running bot.
- **Chat and group controls:** Includes commands for bot mode, group chatbot
  settings, and owner-managed features.
- **AI replies:** `.ai` sends a direct request to Groq. Image messages are also
  supported. Direct-message auto-replies and a separate group chatbot can be
  enabled with their respective commands.
- **Web connection page:** The root page displays connection status and lets
  you request a WhatsApp pairing code.
- **Persistent state options:** Store runtime files on a mounted volume or
  back up the WhatsApp session to a separate encrypted GitHub branch.
- **Plugin updates:** An owner can update all or selected plugins without
  restarting the WhatsApp connection.

## Quick Start

### Requirements

- Node.js and npm, or Docker
- A WhatsApp account to pair with the bot
- A persistent storage location for deployments where the session must survive
  container replacement

The Docker image is based on Node.js 24 and installs FFmpeg and native build
dependencies used by the project.

### Install and configure

```bash
git clone https://github.com/realjumason-md/aijai-md.git
cd aijai-md
npm ci
```

Create a `.env` file in the repository root. For example:

```env
PORT=5000
PREFIXES=.
OWNER_NUMBER=<your-number-with-country-code>
```

Start the bot:

```bash
npm start
```

Open `http://localhost:5000`, enter the WhatsApp number with its country code,
and submit the form. Enter the displayed pairing code in WhatsApp's linked
devices flow. The server also exposes `/health` for health checks.

`PAIRING_NUMBER` can be set to request a pairing code automatically at startup.
CLI phone-number prompts are disabled unless `CLI_PAIRING=true` is set.

## Configuration

Configuration is loaded from environment variables by [config.js](config.js).
The following settings are useful for a typical deployment:

| Variable                       | Purpose                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `BOT_NAME`                     | Name displayed by the bot.                                                        |
| `OWNER_NUMBER`                 | Owner's WhatsApp number, including country code.                                  |
| `PREFIXES`                     | Comma-separated command prefixes. Defaults to `.`, `!`, `/`, `£`, `🇺🇬`, and `⛱️`. |
| `PORT`                         | HTTP server port; defaults to `5000`.                                             |
| `HOST`                         | HTTP bind address; defaults to `0.0.0.0`.                                         |
| `TIMEZONE`                     | Time zone used in bot responses; defaults to `Africa/Kampala`.                    |
| `PAIRING_NUMBER`               | Optional number for automatic startup pairing.                                    |
| `BOT_STORAGE_DIR`              | Storage root for hosts other than Railway.                                        |
| `RAILWAY_VOLUME_MOUNT_PATH`    | Storage root supplied when a Railway volume is attached.                          |
| `SESSION_STORAGE`              | Session mode: `auto`, `local`, or `github`.                                       |
| `GROQ_API_KEY`                 | Groq API key required for AI replies.                                             |
| `GROQ_MODEL`                   | Optional text model override.                                                     |
| `GROQ_VISION_MODEL`            | Optional image model override.                                                    |
| `PLUGIN_REPO`, `PLUGIN_BRANCH` | Source repository and branch used by `.updateplugins`.                            |
| `PLUGIN_WATCH`                 | Set to `true` to watch plugin files in production.                                |

The bot also supports provider-specific API-key variables for integrations;
configure only the keys required by the features you use. Keep all credentials
out of source control.

## WhatsApp Session Storage

The storage root is selected in this order: `BOT_STORAGE_DIR`,
`RAILWAY_VOLUME_MOUNT_PATH`, then the current working directory. Runtime data,
temporary files, and the Baileys session are stored beneath that root.

For a hosted deployment, attach persistent storage and point the service at its
mount path. On Railway, attach a volume to the service; Railway provides
`RAILWAY_VOLUME_MOUNT_PATH`. A local container filesystem may be discarded on
redeploy, so local storage alone does not preserve a session across container
replacement.

### Encrypted GitHub backup

Use this option when the host does not provide a persistent volume. Configure
these variables on the service:

```env
SESSION_STORAGE=github
GITHUB_PERSONAL_ACCESS_TOKEN=<repository-access-token>
GITHUB_SESSION_REPO=<owner>/<repository>
GITHUB_SESSION_BRANCH=bot-session
SESSION_ENCRYPTION_KEY=<long-random-secret>
```

The session backup is encrypted before it is written to the configured GitHub
repository. `GITHUB_SESSION_REPO` defaults to `realjumason-md/aijai-md`,
`GITHUB_SESSION_BRANCH` defaults to `bot-session`, and
`SESSION_ENCRYPTION_KEY` is optional. If the encryption key is omitted, the
GitHub token is used as the encryption key. Keep the configured key stable so
an existing backup remains readable. Never commit or share the token or key.

`SESSION_STORAGE=auto` is the default: it uses GitHub session storage when a
GitHub token is configured and otherwise uses local storage. For local
development, `SESSION_STORAGE=local` explicitly selects local storage.

## AI Commands

Set `GROQ_API_KEY` to enable Groq requests. The bot can process text requests
with `.ai <question>` and image inputs with the same command. Available AI
commands include:

| Command                            | Purpose                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `.ai <question>`                   | Ask the AI assistant.                                                                     |
| `.aion` / `.aioff`                 | Enable or disable automatic replies in the current direct chat.                           |
| `.aionall` / `.aioffall`           | Enable or disable automatic replies across direct chats.                                  |
| `.aiswitch groq` / `.aiswitch off` | Select Groq or turn AI off.                                                               |
| `.aikey`                           | Check provider readiness without displaying the API key.                                  |
| `.chatbot on` / `.chatbot off`     | Enable or disable automatic AI replies in the current group; requires group-admin access. |

Private-chat controls apply to direct messages. Group chatbot settings are
separate and are controlled from the group.

## Commands and Plugins

Use `.menu` in WhatsApp for the live command list, or `.menu <command>` for
details. The default prefix is `.`, but prefixes can be changed with
`PREFIXES`.

Plugins are JavaScript modules in `plugins/`. In development, changes to plugin
files are watched and reloaded. In production, watching is disabled unless
`PLUGIN_WATCH=true` is set. To fetch plugin updates from the configured GitHub
repository, run:

```text
.updateplugins
.updateplugins menu echo
```

The updater is owner-only, reloads changed commands, and leaves the WhatsApp
connection running.

## Railway Deployment

The repository includes a Dockerfile and Railway configuration. Railway uses
the Dockerfile, starts the service with `scripts/start-railway.sh`, checks
`/health`, and is configured to restart the process when it exits.

1. Deploy the repository as a Docker-based service.
2. Attach a persistent volume to the service, or configure encrypted GitHub
   session backup as described above.
3. Set any required environment variables, including `OWNER_NUMBER` and
   `GROQ_API_KEY` if you plan to use AI.
4. Open the service URL and use the connection form to pair WhatsApp.

## HTTP Endpoints

| Path                   | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `/`                    | Bot status and WhatsApp pairing form.      |
| `/api/pairing/status`  | Current pairing status.                    |
| `/api/pairing/request` | Request a pairing code for a phone number. |
| `/health`              | Health check.                              |
| `/api/healthz`         | Health-check alias.                        |

The pairing routes are served by the same HTTP server as the bot. Restrict
access to the service according to your deployment needs.

## Development

```bash
# Start the bot
npm start

# Start in development mode
npm run dev

# Check JavaScript syntax
npm run build

# Run tests
npm test

# Run ESLint
npm run lint
```

The test suite uses Node's built-in test runner and lives in `tests/`. Core
WhatsApp connection and message handling are in `index.js` and `lib/`; command
plugins are in `plugins/`.
