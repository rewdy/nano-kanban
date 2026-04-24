---
description: Stop the nano-kanban daemon cleanly.
---

Shut down the nano-kanban daemon following the `nano-kanban` skill's "Stopping the daemon" steps:

1. Find the pid listening on port 7777.
2. Send it SIGINT so it flushes pending writes before exiting.
3. Verify the port is free.

Leave `./tasks.json` in place — that's the user's record. Only delete it if the user explicitly asks.

If the daemon isn't running, just say so — don't treat it as an error.
