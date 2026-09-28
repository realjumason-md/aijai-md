# aijai-md WhatsApp Bot

This service uses the MEGA-MD runtime architecture: a shared Baileys
connection, automatic plugin loading, persistent JSON storage, reconnect
handling, permission checks, and Railway-compatible health checks.

## Runtime layout

- `index.js` starts the HTTP server and WhatsApp connection.
- `lib/` contains the shared connection, message, storage, and permission
  helpers.
- `plugins/` contains only the command library that originally shipped with
  `aijai-md`. Every `.js` file is loaded automatically at startup; new
  commands do not need a central registry entry.
- `data/` stores JSON-backed runtime state when no external database is set.
- `session/` stores the multi-file WhatsApp session and must persist between
  deploys.

## Required deployment variables

Set these in Railway's Variables tab:

```env
OWNER_NUMBER=256706106326
PAIRING_NUMBER=256706106326
```

Use either `SESSION_ID` for an existing session or `PAIRING_NUMBER` to receive
an eight-character pairing code in the service logs. `OWNER_NUMBER` should be
digits only with the country code and no plus sign.

## Common configuration

```env
BOT_NAME=aijai-md
BOT_OWNER=Ali Jaiton
PREFIXES=.,!,/,£,🇺🇬,⛱️
COMMAND_MODE=public
TIMEZONE=Africa/Kampala
PORT=5000
```

Optional integrations use environment variables only. No API keys are stored in
the repository. The JSON backend is used by default; `MONGO_URL`,
`POSTGRES_URL`, `MYSQL_URL`, or `DB_URL` can select another storage backend.

## Health check

Railway and local checks can use:

```text
/api/healthz
```

## Local commands

```bash
pnpm install
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run dev
```

The build command runs `node --check` across the runtime and all plugins.

## Original command set

The rebuilt runtime preserves these commands and aliases:

- `menu` (`list`, `help`, `h`, `commands`)
- `aion`, `aioff`, `aionall`, `aioffall`
- `alive` (`status`, `bot`)
- `ping` (`p`, `pong`)
- `viewonce` (`vv`, `viewmedia`)
- `owner` (`creator`)
- `echo`