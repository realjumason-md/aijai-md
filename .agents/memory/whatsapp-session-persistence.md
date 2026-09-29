---
name: WhatsApp session persistence
description: Durable-session constraints for Railway deployments without persistent volumes.
---

Railway deployments without a volume must persist the complete Baileys multi-file
authentication state through an encrypted external backup. A single
`creds.json` or static environment variable is not sufficient because Signal
keys change during normal operation.

**Why:** Rebuilding an ephemeral container without all session files forces
WhatsApp to request a new pairing and increases account risk.

**How to apply:** Require a successful read/write check for the encrypted
backup before pairing. Keep the backup on a branch or store that does not
trigger production deploys, never persist raw WhatsApp credentials, and never
request a new pairing code automatically while recovering from a socket restart.
Only an explicit first-time pairing or actual logout should enter pairing flow.