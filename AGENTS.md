# AGENTS.md

Guidance for AI coding agents working in this repository.

## Commands

Package manager is pnpm (`packageManager` pins pnpm@10.13.1). Node ≥ 20 required.

```bash
pnpm install
pnpm dev                                # run CLI via tsx (no build)
pnpm test                               # node:test suite (src/*.test.ts)
node --import tsx --test src/store.test.ts   # run a single test file
pnpm typecheck                          # tsc --noEmit
pnpm build                              # emit dist/ via tsconfig.build.json
pnpm format / pnpm format:check         # oxfmt
```

`prepare` runs `tsc -p tsconfig.build.json` so `dist/` is produced on install from git (the package ships via `github:rewdy/nano-kanban`, not npm registry).

To exercise the daemon manually: `pnpm dev` then open `http://127.0.0.1:7777/` for the dashboard and POST to `/mcp` for tool calls. State lands in `./tasks.json` in the cwd.

## Architecture

nano-kanban is a **long-running HTTP daemon** — one process per project, one URL shared by every MCP client and the dashboard. This is the load-bearing design choice: clients must connect over streamable HTTP, never via stdio `command`/`args`, or each would spawn its own daemon and lose the shared board.

Four files carry the system:

- `src/index.ts` — CLI entry. Parses `serve [--port] [--file]`, wires SIGINT/SIGTERM to `handle.close()`.
- `src/server.ts` — `node:http` server. Routes: `POST /mcp` (gated by `isLocalRequest` — Host header and Origin must be localhost), `GET /events` (SSE), `GET /` (dashboard HTML). Each MCP POST creates a fresh `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined` (stateless per-request).
- `src/mcp.ts` — builds the `McpServer` and registers all ten tools. Calls `store.*` and wraps the result via `unwrap`/`ok`/`err` helpers.
- `src/store.ts` — single source of truth. Holds the `Board` in memory, serializes mutations through a `Mutex`, fans out snapshots to SSE subscribers, and debounces disk writes (150ms, atomic `writeFile(tmp)` → `rename`).
- `src/dashboard.ts` — inline HTML (string template) consumed by `GET /`. No build step, no framework.

### Mutations and error shape

Every `Store` mutation runs inside `mutex.run`. Results are returned as tagged unions — `{ ok: true, task }` or `{ ok: false, code, ...extra }` — never thrown. `mcp.ts` converts a non-`ok` result to `{ isError: true, structuredContent: { code, ... } }` so MCP clients can branch on codes (`already_claimed`, `blocked`, `not_assignee`, `not_found`, `wrong_status`). When adding a new mutation, preserve this pattern: put the branch logic in `store.ts`, add the new `Err<...>` variant to the return type, and let `mcp.ts`'s `unwrap` carry it through unchanged.

### Reactivity and persistence

`Store.onChange` both calls every subscriber with a structured clone and schedules a debounced flush. `server.ts` attaches one subscriber that pushes a `data:` SSE event to every connected dashboard client. There is no separate diff/patch channel — each SSE frame is the full board snapshot. `shutdown()` cancels the timer, awaits any in-flight write, and does a final `flush()` so `tasks.json` is consistent on exit.

Atomic writes use `writeFile(`${path}.tmp`)` followed by `rename` — don't replace this with a direct write or crash-during-write can corrupt the board.

### Security boundary

`startServer` binds `127.0.0.1` by default and `isLocalRequest` rejects any MCP POST whose `Host` or `Origin` isn't localhost. There is no auth — localhost *is* the security boundary. Don't add a flag to bind `0.0.0.0` without also adding auth.

## Distribution

The repo also ships as a Claude Code plugin:

- `.claude-plugin/plugin.json` declares the MCP server config clients should use.
- `commands/kanban-*.md` are the `/kanban-setup`, `/kanban-status`, `/kanban-teardown` slash commands.
- `skills/nano-kanban/` is the skill that teaches agents how to drive the board.

When editing tool semantics or adding tools in `mcp.ts`, check whether the skill under `skills/nano-kanban/` needs a matching update — the skill is the human-readable contract for agents.
