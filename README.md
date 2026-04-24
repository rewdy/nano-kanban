# nano-kanban

A tiny shared task board for AI agents. One process, one file, one URL.

`nano-kanban` is **just task orchestration** — a shared blackboard where multiple agents can claim tasks, comment for reviewers, and mark them done. It does not spawn agents, plan work, or manage workflows. For those things, _let go and let claude_. This is just the piece you drop in to enable two or more agents to coordinate on a list of tasks.

- **MCP server** over streamable HTTP, so any agent that speaks MCP can use it.
- **Live dashboard** at the same URL for a human to watch the board.
- **One JSON file** (`./tasks.json`) as state. Per-cwd, per-session.
- **Zero config.** One command, done.

![nano-kanban dashboard](./dashboard.png)

## Quick start with Claude Code (recommended)

Install the Claude Code plugin — it bundles the MCP config, a skill that teaches Claude how to drive the board, and `/kanban-*` slash commands:

```
/plugin install github:rewdy/nano-kanban
```

The first time you try to use it, Claude will check for the `nano-kanban` CLI and ask you to install it if it isn't on your PATH:

```bash
npm install -g github:rewdy/nano-kanban
```

(This is a global binary on your system, so the plugin asks rather than installing it silently.)

Then just talk to Claude:

- **"Set up a task board with these items: …"** — Claude starts the daemon, creates tasks, and points you at the dashboard.
- **"Work through the tasks."** — Claude claims, works, comments, and completes tasks one at a time.
- **"Shut down the board."** — Claude stops the daemon cleanly. `tasks.json` stays as a record.

Or use the slash commands directly: `/kanban-setup`, `/kanban-status`, `/kanban-teardown`.

Requires Node ≥ 20.

## Quick start with Codex

This repo now includes a Codex plugin manifest at [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json) and a matching MCP config at [`.mcp.json`](./.mcp.json).

Use those files to load the plugin in Codex, then talk to it the same way you would in Claude:

- **"Set up a task board with these items: …"** — Codex starts the daemon, creates tasks, and points you at the dashboard.
- **"Work through the tasks."** — Codex claims, works, comments, and completes tasks one at a time.
- **"Shut down the board."** — Codex stops the daemon cleanly. `tasks.json` stays as a record.

The bundled skill is still [`skills/nano-kanban/SKILL.md`](./skills/nano-kanban/SKILL.md), so the task-board workflow stays the same across both clients.

---

## Manual install (without the plugin)

If you want to use nano-kanban without the Claude Code or Codex plugin — from another agent, from a script, or just to see the dashboard — install the CLI and start the daemon yourself.

### Install the CLI

```bash
pnpm add -g github:rewdy/nano-kanban
# or
npm install -g github:rewdy/nano-kanban
```

Pin to a release tag:

```bash
pnpm add -g github:rewdy/nano-kanban#v0.1.0
```

Or run ad-hoc without installing:

```bash
npx github:rewdy/nano-kanban serve
```

### Run the daemon

```bash
nano-kanban serve
```

```
nano-kanban listening on http://127.0.0.1:7777
  Dashboard: http://127.0.0.1:7777/
  MCP URL:   http://127.0.0.1:7777/mcp
  State:     /path/to/project/tasks.json
```

Options: `nano-kanban serve [--port 7777] [--file ./tasks.json]`.

### Wire it up manually

nano-kanban is a **long-running HTTP daemon**, so you start it once per project and every MCP-speaking client points at the same URL. Don't use the stdio `"command"` / `"args"` config pattern — that would spawn a fresh daemon per session and lose the shared board.

With the Claude Code CLI:

```bash
claude mcp add --transport http nano-kanban http://127.0.0.1:7777/mcp
```

Or add this to `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "nano-kanban": {
      "type": "http",
      "url": "http://127.0.0.1:7777/mcp"
    }
  }
}
```

If you are wiring up another MCP-capable client, point it at `http://127.0.0.1:7777/mcp` using the same shape.

Agents should pass a stable `agent_id` string (e.g. `"claude-main"` or `"codex-main"`) on claim/complete/release so the board knows who owns what.

## MCP tools

| Tool            | Purpose                                                                     | Contention behavior                                                     |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `list_tasks`    | List all tasks, optional status filter                                      | —                                                                       |
| `create_task`   | Add a new task to Todo                                                      | —                                                                       |
| `claim_task`    | Todo → In Progress, sets assignee                                           | Fails with `already_claimed` / `blocked` / `not_found` / `wrong_status` |
| `add_comment`   | Append a comment (works on any status)                                      | —                                                                       |
| `complete_task` | In Progress → Done                                                          | Fails with `not_assignee` / `wrong_status` / `not_found`                |
| `release_task`  | In Progress → Todo                                                          | Fails with `not_assignee` / `wrong_status` / `not_found`                |
| `block_task`    | Add blocker task ids                                                        | —                                                                       |
| `unblock_task`  | Remove specific blocker ids                                                 | —                                                                       |
| `request_human` | Flag the task as needing human input (stays in column, flares on dashboard) | —                                                                       |
| `resume_task`   | Clear the needs-human flag                                                  | —                                                                       |

### Error shape

Errors an agent might want to branch on are returned as `{ isError: true, structuredContent: { code, ... } }` rather than thrown. For example:

```json
{ "isError": true, "structuredContent": { "code": "already_claimed", "claimed_by": "claude-main" } }
```

`already_claimed` is a cue to pick the next task. `not_found`, `wrong_status`, `blocked`, and `not_assignee` usually indicate the agent should surface the problem.

## Dashboard

Three columns: Todo, In Progress, Done. Each card shows title, short id, assignee, comment count, and blocker count. Click the `💬` badge on any card to expand the comment thread.

Tasks flagged with `needs_human` get a prominent orange flare and pin to the top of their column, with the reason shown inline.

Theme switcher in the top-right: System (follows OS), Light, or Dark. Choice persists to `localStorage`.

## Security model

nano-kanban binds `127.0.0.1` only and rejects MCP requests whose `Host`/`Origin` header isn't localhost. There is no auth — the localhost boundary is the security boundary. Don't expose the daemon beyond localhost.

## Development

```bash
pnpm install
pnpm dev          # run with tsx, no build step
pnpm test         # node:test suite for the store
pnpm typecheck    # tsc --noEmit
pnpm build        # emit dist/
```

Source layout:

```
src/
├── index.ts       # CLI
├── server.ts      # node:http, routes /mcp /events /
├── mcp.ts         # McpServer + tool registrations
├── store.ts       # tasks.json state, mutex, SSE fan-out
└── dashboard.ts   # inline HTML dashboard
```

## License

MIT
