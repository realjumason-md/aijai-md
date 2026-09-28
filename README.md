# aijai-md

A single-process WhatsApp bot based on the MEGA-MD runtime layout, with aijai-md branding and custom commands.

## Railway

Railway should deploy this repository as one service from the repository root.

- Build: `npm ci --omit=dev`
- Start: `npm run start:optimized`
- Health check: `/health`

Set `OWNER_NUMBER` and `PAIRING_NUMBER`, or provide `SESSION_ID` for an existing WhatsApp session.
