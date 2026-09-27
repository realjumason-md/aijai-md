# aijai-md WhatsApp Bot

`aijai-md` is a Node.js WhatsApp bot built with
[`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys). It uses
WhatsApp multi-device authentication, a persistent multi-file session, pairing
codes instead of QR codes, and a plugin-based command system.

Repository: <https://github.com/realjumason-md/aijai-md>

## Features

- Pairing-code login only; QR output is disabled.
- Session credentials are saved in `session/`.
- Automatic reconnect with exponential backoff.
- Commands live in `src/bot/plugins/`.
- Supports `.`, `!`, `/`, `£`, `🇺🇬`, and `⛱️` prefixes by default.
- View-once image/video reveal when the command is sent as a reply.
- Optional image understanding through Groq, Gemini, OpenAI, or xAI.

## Commands

| Command | Aliases | Description |
| --- | --- | --- |
| `menu` | `list`, `help`, `h`, `commands` | Show all commands |
| `alive` | `status`, `bot` | Show online status and uptime |
| `ping` | `p`, `pong` | Check response speed |
| `viewonce` | `vv`, `viewmedia` | Reveal replied-to view-once media |
| `owner` | `creator` | Show owner information |
| `echo` | — | Repeat the supplied text |
| `aion` | — | Turn on AI replies in the current chat |
| `aioff` | — | Turn off AI replies in the current chat |
| `aionall` | — | Turn on AI replies in all direct messages |
| `aioffall` | — | Turn off AI replies in all direct messages |

Examples: `.menu`, `!ping`, `/alive`, `£owner`, `🇺🇬echo hello`.

### AI reply controls

- `aion` enables replies in only the chat where it is sent.
- `aioff` disables replies in only the chat where it is sent.
- `aionall` enables replies in every direct message.
- `aioffall` disables replies in every direct message.

The latest command wins. Chat-specific `aion` and `aioff` settings override
the global direct-message setting. Running either global command clears older
chat-specific overrides so the global choice becomes authoritative. Settings
are saved in `session/ai-settings.json`.

## Environment variables

Copy the following into your deployment's environment-variable or Secrets
section. Never paste API keys into chat or commit them to Git.

```env
BOT_NAME=aijai-md
OWNER_NAME=Ali Jaiton
OWNER_NUMBER=256706106326
PAIRING_NUMBER=256706106326
PREFIXES=.,!,/,£,🇺🇬,⛱️
SESSION_DIR=./session
AUTO_DESCRIBE_IMAGES=true

# Optional image understanding
# VISION_PROVIDER=auto
# VISION_MODEL=
# GROQ_API_KEY=
# GEMINI_API_KEY=
# OPENAI_API_KEY=
# XAI_API_KEY=
```

`VISION_PROVIDER=auto` selects the first configured provider in this order:
Groq, Gemini, xAI, then OpenAI. Set it to `groq`, `gemini`, `xai`, `openai`, or
`off` when you want to choose explicitly.

The image handler downloads incoming WhatsApp images and sends them to the
selected provider as base64 image input. Without a vision key, the bot still
runs and tells the sender that image understanding is not configured.

## Pairing the bot

1. Set `PAIRING_NUMBER` to the WhatsApp number that will own the bot, digits
   only, including the country code and without `+`.
2. Start the service.
3. Watch the service logs for:

   `WHATSAPP PAIRING CODE — enter this code on your phone`

4. On the owner phone, open **WhatsApp → Linked devices → Link a device →
   Link with phone number instead**.
5. Enter the printed pairing code.
6. Keep the `session/` directory between restarts. If it is deleted, the bot
   must be paired again.

On Railway, add the variables in the service's Variables tab. Mount a Railway
Volume at `/app/session` and set `SESSION_DIR=/app/session` if you want the
WhatsApp session and AI reply settings to survive redeploys. Without a volume,
the bot will need to be paired again after a redeploy.

## Local development

From the repository root:

```bash
pnpm install
PORT=8080 pnpm --filter @workspace/api-server run dev
```

The HTTP health endpoint remains available at `/api/healthz`; the bot itself
connects to WhatsApp when the service starts.

## Adding a command

Create a file under `src/bot/plugins/`, export a `BotPlugin`, then add it to
`src/bot/plugins/index.ts`. A plugin receives the socket, original message,
parsed arguments, configuration, and a `reply()` helper.

```ts
import type { BotPlugin } from "../types";

const examplePlugin: BotPlugin = {
  name: "example",
  aliases: ["ex"],
  description: "Example command",
  usage: "example",
  async handler(context) {
    await context.reply("It works.");
  },
};

export default examplePlugin;
```