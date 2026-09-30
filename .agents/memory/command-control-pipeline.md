---
name: Command control pipeline
description: Durable behavior for bot access modes and maintenance mode.
---

Bot access mode and maintenance mode are separate controls. Access mode is evaluated before command and AI handling, while maintenance mode is enforced by the command dispatcher so every non-owner command is covered, including commands added later.

**Why:** A settings command can report the right state while the bot still processes messages if enforcement is only implemented inside the settings plugin.

**How to apply:** Keep mode state in the shared store and keep maintenance state persistent; owner and sudo users must retain a path to change either setting.