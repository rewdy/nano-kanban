# nano-kanban

A tiny shared task board for AI agents. One process, one file, one URL.

nano-kanban is **just task orchestration** — a shared blackboard where multiple agents can claim tasks, comment for reviewers, and mark them done. It does not spawn agents, plan work, or manage workflows. It's the piece you drop in when you want two or more agents to coordinate on a todo list.

- **MCP server** over streamable HTTP, so any agent that speaks MCP can use it.
- **Live dashboard** at the same URL for a human to watch the board.
- **One JSON file** (`./tasks.json`) as state. Per-cwd, per-session.
- **Zero config.** One command, done.

## Install

From GitHub:

```bash
pnpm add -g github:rewdy/nano-kanban
# or
npm install -g github:rewdy/nano-kanban
```

Requires Node ≥ 20.

## Usage

Run inside the project directory where you want `tasks.json` to live:

```bash
nano-kanban serve
```

You'll see:

```
nano-kanban listening on http://127.0.0.1:7777
  Dashboard: http://127.0.0.1:7777/
  MCP URL:   http://127.0.0.1:7777/mcp
  State:     /path/to/project/tasks.json
```

Open the dashboard in a browser to watch. Point your agent at the MCP URL.

### Options

```
nano-kanban serve [--port 7777] [--file ./tasks.json]
```

### Wiring into Claude Code

Add the MCP server to your Claude Code config:

```bash
claude mcp add --transport http nano-kanban http://127.0.0.1:7777/mcp
```

Then in a Claude Code session, the agent can call `list_tasks`, `claim_task`, etc. The agent should pass a stable `agent_id` string (e.g. `"claude-main"`) on claim/complete/release so the board knows who owns what.

## MCP tools

| Tool | Purpose | Contention behavior |
|---|---|---|
| `list_tasks` | List all tasks, optional status filter | — |
| `create_task` | Add a new task to Todo | — |
| `claim_task` | Todo → In Progress, sets assignee | Fails with `already_claimed` / `blocked` / `not_found` / `wrong_status` |
| `add_comment` | Append a comment (works on any status) | — |
| `complete_task` | In Progress → Done | Fails with `not_assignee` / `wrong_status` / `not_found` |
| `release_task` | In Progress → Todo | Fails with `not_assignee` / `wrong_status` / `not_found` |
| `block_task` | Add blocker task ids | — |
| `unblock_task` | Remove specific blocker ids | — |
| `request_human` | Flag the task as needing human input (stays in column, flares on dashboard) | — |
| `resume_task` | Clear the needs-human flag | — |

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
