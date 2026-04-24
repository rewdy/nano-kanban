---
name: nano-kanban
description: Coordinate multi-agent work through a shared kanban board. Use when the user says "set up a task board", "kick off tasks", "work through the tasks", or otherwise asks to divide work into trackable items shared across sessions. Also use to teach the user how to install nano-kanban if the CLI isn't on their system yet.
---

# nano-kanban workflow

nano-kanban is a long-running HTTP daemon that serves an MCP endpoint at `http://127.0.0.1:7777/mcp` and a live dashboard at `http://127.0.0.1:7777/`. State lives in `./tasks.json` in the user's current working directory.

The nano-kanban MCP tools are configured by this plugin — once the daemon is running, you can call `list_tasks`, `create_task`, `claim_task`, `add_comment`, `complete_task`, `release_task`, `block_task`, `unblock_task`, `request_human`, `resume_task` directly.

## Preflight: is the CLI installed?

Before you can start the daemon, the `nano-kanban` binary has to be on the user's PATH. Check it silently:

```bash
command -v nano-kanban
```

**If the command returns nothing (not installed):**

Stop and ask the user to install it. Do NOT try to run it, npx it, or silently install it yourself — the user wants to install global packages on their own system deliberately. Print this exactly:

> nano-kanban isn't installed yet. To install it globally, run:
>
> ```
> npm install -g github:rewdy/nano-kanban
> ```
>
> Or, pinned to a released tag:
>
> ```
> npm install -g github:rewdy/nano-kanban#v0.1.0
> ```
>
> Let me know when it's installed and I'll continue.

Then wait for the user's confirmation. Don't proceed until they say so.

## Starting the daemon

Once the CLI is installed and the user wants a task board:

1. Check if it's already running:
   ```bash
   lsof -i :7777 -sTCP:LISTEN
   ```
   If something is already listening on 7777, assume it's a running nano-kanban and skip to the next section. Don't start a second daemon.

2. Otherwise, start it as a **background process** so it outlives the shell invocation, with logs going to a temp file:
   ```bash
   nano-kanban serve > /tmp/nano-kanban.log 2>&1 &
   ```
   (If the current harness has a "run in background" feature for shell commands, use that. The daemon must survive the tool call.)

3. Wait ~1 second, then verify it's up by reading `/tmp/nano-kanban.log` — you should see the `listening on http://127.0.0.1:7777` line.

4. Tell the user succinctly:
   > Task board is up: http://127.0.0.1:7777/ — open that in a browser to watch.

## Creating tasks

Use the `create_task` MCP tool, one call per task. Title should be specific enough that a human scanning the dashboard knows what the task is. Optional `description` can add context; `blocked_by` can reference other task ids.

Example (conceptual):
- `create_task({ title: "Write migration for user_preferences" })`
- `create_task({ title: "Deploy schema change", blocked_by: ["<migration id>"] })`

Once tasks are created, confirm with the user briefly (e.g. "Seeded 4 tasks. Ready to work them?") before taking any action.

## Working through tasks (for autonomous loops)

When the user says "work through the tasks" or similar:

1. `list_tasks({ status: "todo" })` — if empty, the work is done. Before reporting back:
   - Also check `list_tasks({ status: "in_progress" })`. If anything is still in progress (e.g. claimed by another agent), don't tear down — just report what's left and stop.
   - If Todo and In Progress are both empty, **stop the daemon** (see "Stopping the daemon" below) and tell the user something like: "All tasks complete — shut the board down. `tasks.json` is still here as a record."
2. Pick the first task. Call `claim_task({ id, agent_id: "<a-stable-id-for-this-session>" })`.
   - On `{ code: "already_claimed" }`: skip it, try the next todo. This is not an error.
   - On `{ code: "blocked" }`: skip it and pick another (a blocker is still open).
   - On `{ code: "not_found" }` or `{ code: "wrong_status" }`: surface it — something unexpected happened.
3. Do the actual work. Use `add_comment` to leave breadcrumbs a reviewer would find useful (what you did, edge cases you noticed).
4. When you need the user's input to make progress (a decision, a credential, a confirmation), call `request_human({ id, reason: "..." })` and **wait for the user**. The dashboard flares the card orange with your reason. Once the user answers, call `resume_task({ id })`.
5. When the task is done, call `complete_task({ id, agent_id })`. On `not_assignee`, don't force it — surface the mismatch.
6. If you cannot complete a task, `release_task({ id, agent_id })` returns it to Todo for someone else.
7. Loop back to step 1.

Pick a stable `agent_id` per session (e.g. `"claude-main"` or `"claude-<short-purpose>"`). Reuse it for claim/complete/release of the same task.

## Stopping the daemon

Stop the daemon in these cases:

- The user says "tear down" / "shut down the board" / "we're done."
- You just finished an autonomous work loop and Todo + In Progress are both empty (no other agent still holds a task).

Steps:

1. Find the pid: `lsof -i :7777 -t -sTCP:LISTEN`
2. SIGINT it: `kill -INT <pid>` (this flushes pending writes and closes cleanly).
3. Confirm it stopped: `lsof -i :7777 -sTCP:LISTEN` should return nothing.
4. **Tell the user** the board has been stopped (e.g. "Task board shut down. `tasks.json` is still in place as a record."). Don't shut it down silently — the user needs to know the dashboard they had open is no longer live.
5. Leave `tasks.json` in place — it's the user's record. Only delete it if they explicitly ask you to.

## Important: what NOT to do

- **Don't** try to `npm install -g` on the user's behalf. If the CLI is missing, ask them to install it.
- **Don't** spawn the daemon inside `claude mcp add`-style stdio subprocess pattern — nano-kanban is an HTTP daemon; each session should share the same running instance via the already-configured MCP URL.
- **Don't** poll or spin-wait on the dashboard. The MCP tools are the authoritative interface.
- **Don't** use `rm tasks.json` as a "reset" without asking. It's user data.
- **Don't** start the daemon just because you loaded this skill. Only start it when the user actually asks to set up / work on tasks.
