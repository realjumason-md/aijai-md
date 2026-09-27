---
name: Baileys runtime dependency
description: Workspace-specific packaging constraint for the WhatsApp bot service.
---

When the API service bundles `@whiskeysockets/baileys`, keep `protobufjs` declared
directly in the service dependencies because the build configuration externalizes
it and Node resolves external packages from the service package boundary.

**Why:** The bundle can finish successfully while production startup fails with
`ERR_MODULE_NOT_FOUND` if protobufjs is only reachable as a transitive dependency.

**How to apply:** Recheck this direct dependency whenever the Baileys version or
the API bundler's external package list changes.