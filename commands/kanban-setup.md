---
description: Start the nano-kanban daemon and seed it with tasks from my description.
argument-hint: "<describe the tasks you want to track>"
---

The user wants to set up a nano-kanban task board. Follow the `nano-kanban` skill:

1. Preflight — make sure the `nano-kanban` CLI is installed. If not, stop and ask the user to install it.
2. Start the daemon in the background if it isn't already running. Tell the user the dashboard URL.
3. Read the user's task description below and create one task per item via `create_task`. Use clear titles; add descriptions for non-obvious tasks; use `blocked_by` when one task must finish before another.
4. Confirm briefly what you created. Don't start working the tasks yet — wait for the user to say "go" or equivalent.

User's task description:

$ARGUMENTS
