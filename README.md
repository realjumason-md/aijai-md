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

Required variables for a new connection:

```env
OWNER_NUMBER=256706106326
PAIRING_NUMBER=256706106326
```

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
