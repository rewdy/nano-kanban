---
description: Show the current state of the nano-kanban board.
---

Call the nano-kanban `list_tasks` MCP tool and give the user a concise summary of the board:

- Counts per column (Todo / In Progress / Done)
- For In Progress tasks, show title + assignee; flag any with `needs_human: true` prominently
- For Todo tasks with `blocked_by`, note which blockers are still open
- Omit Done task bodies unless the user asks for them

If the daemon isn't running (the MCP call fails), don't try to restart it — just tell the user and ask whether they'd like to start it.

Do not modify anything. This command is read-only.
