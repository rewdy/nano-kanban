import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Store, Task, Result } from "./store.js";

const STATUS = z.enum(["todo", "in_progress", "done"]);

export function buildMcpServer(store: Store): McpServer {
  const server = new McpServer({ name: "nano-kanban", version: "0.1.0" });

  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description: "List all tasks on the board. Optionally filter by status.",
      inputSchema: { status: STATUS.optional() },
    },
    async ({ status }) => {
      const tasks = await store.listTasks(status);
      return ok({ tasks });
    },
  );

  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description: "Add a new task to the Todo column. Optionally include blocked_by task ids.",
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        blocked_by: z.array(z.string()).optional(),
      },
    },
    async ({ title, description, blocked_by }) => {
      const result = await store.createTask({ title, description, blocked_by });
      return unwrap(result);
    },
  );

  server.registerTool(
    "claim_task",
    {
      title: "Claim Task",
      description:
        "Claim a Todo task for an agent, moving it to In Progress. Fails cleanly with structured codes: already_claimed (pick the next task), blocked (dependencies open), not_found, wrong_status.",
      inputSchema: { id: z.string(), agent_id: z.string() },
    },
    async ({ id, agent_id }) => {
      const result = await store.claimTask({ id, agent_id });
      return unwrap(result);
    },
  );

  server.registerTool(
    "add_comment",
    {
      title: "Add Comment",
      description:
        "Add a comment to a task. Works on any status (useful for reviewer comments on Done tasks).",
      inputSchema: { id: z.string(), author: z.string(), body: z.string().min(1) },
    },
    async ({ id, author, body }) => {
      const result = await store.addComment({ id, author, body });
      return unwrap(result);
    },
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: "Mark a task Done. Caller's agent_id must match the task's assignee.",
      inputSchema: { id: z.string(), agent_id: z.string() },
    },
    async ({ id, agent_id }) => {
      const result = await store.completeTask({ id, agent_id });
      return unwrap(result);
    },
  );

  server.registerTool(
    "release_task",
    {
      title: "Release Task",
      description:
        "Return a claimed task to Todo (e.g., cannot complete). Caller must be the assignee.",
      inputSchema: { id: z.string(), agent_id: z.string() },
    },
    async ({ id, agent_id }) => {
      const result = await store.releaseTask({ id, agent_id });
      return unwrap(result);
    },
  );

  server.registerTool(
    "block_task",
    {
      title: "Block Task",
      description: "Add blocker task ids to a task. Merges with any existing blockers.",
      inputSchema: { id: z.string(), blocked_by: z.array(z.string()).min(1) },
    },
    async ({ id, blocked_by }) => {
      const result = await store.blockTask({ id, blocked_by });
      return unwrap(result);
    },
  );

  server.registerTool(
    "unblock_task",
    {
      title: "Unblock Task",
      description: "Remove specific blocker ids from a task.",
      inputSchema: { id: z.string(), blocker_ids: z.array(z.string()).min(1) },
    },
    async ({ id, blocker_ids }) => {
      const result = await store.unblockTask({ id, blocker_ids });
      return unwrap(result);
    },
  );

  server.registerTool(
    "request_human",
    {
      title: "Request Human",
      description:
        "Flag a task as needing human intervention. The task stays in its current column but is visually flared on the dashboard. Optional reason is appended as a system comment.",
      inputSchema: { id: z.string(), reason: z.string().optional() },
    },
    async ({ id, reason }) => {
      const result = await store.requestHuman({ id, reason });
      return unwrap(result);
    },
  );

  server.registerTool(
    "resume_task",
    {
      title: "Resume Task",
      description: "Clear the needs-human flag once the human has unblocked the agent.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const result = await store.resumeTask({ id });
      return unwrap(result);
    },
  );

  return server;
}

type ToolResponse = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function ok(data: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function err(code: string, extra: Record<string, unknown>): ToolResponse {
  const payload = { code, ...extra };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function unwrap(
  result: Result<Task, { ok: false; code: string } & Record<string, unknown>>,
): ToolResponse {
  if (result.ok) return ok({ task: result.task });
  const { ok: _ok, code, ...rest } = result;
  return err(code, rest);
}
