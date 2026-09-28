---
name: Bot runtime contract
description: Compatibility rule for future aijai-md bot and plugin changes.
---

Use the MEGA-MD runtime contract as the compatibility boundary for `aijai-md`:
the existing aijai command set depends on the shared socket, message handler,
storage layer, permission helpers, and automatic command loading rather than a
handwritten command list. Do not import additional MEGA command plugins.

**Why:** The previous partial TypeScript dispatcher only supported a small
subset of commands and could not execute the full plugin library.

**How to apply:** Add or modify only the commands already defined by aijai-md
against the shared MEGA-style context and loader. Keep credentials and
third-party API keys in environment variables, never in source files.