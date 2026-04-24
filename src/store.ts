import { readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { nanoid } from "nanoid";

export type Status = "todo" | "in_progress" | "done";

export type Comment = {
  author: string;
  body: string;
  at: string;
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  status: Status;
  assignee?: string;
  blocked_by?: string[];
  needs_human?: boolean;
  comments: Comment[];
  created_at: string;
  updated_at: string;
};

export type Board = {
  version: 1;
  tasks: Task[];
};

export type Ok<T> = { ok: true; task: T };
export type Err<C extends string, E extends object = object> = { ok: false; code: C } & E;
export type Result<T, E> = Ok<T> | E;

type Listener = (board: Board) => void;

const now = () => new Date().toISOString();
const emptyBoard = (): Board => ({ version: 1, tasks: [] });

export class Store {
  private board: Board = emptyBoard();
  private readonly listeners = new Set<Listener>();
  private readonly mutex = new Mutex();
  private writeTimer: NodeJS.Timeout | null = null;
  private pendingWrite: Promise<void> | null = null;

  constructor(private readonly filePath: string) {}

  static async load(filePath: string): Promise<Store> {
    const store = new Store(resolvePath(filePath));
    if (existsSync(store.filePath)) {
      const raw = await readFile(store.filePath, "utf8");
      const parsed = JSON.parse(raw) as Board;
      if (parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
        throw new Error(
          `tasks file at ${store.filePath} is not a valid board (expected version 1).`,
        );
      }
      store.board = parsed;
    } else {
      await store.flush();
    }
    return store;
  }

  snapshot(): Board {
    return structuredClone(this.board);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async shutdown(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.pendingWrite) await this.pendingWrite;
    await this.flush();
  }

  // ---- mutations ----

  async createTask(input: {
    title: string;
    description?: string;
    blocked_by?: string[];
  }): Promise<Ok<Task>> {
    return this.mutex.run(async () => {
      const task: Task = {
        id: nanoid(8),
        title: input.title,
        description: input.description,
        status: "todo",
        blocked_by: input.blocked_by?.length ? [...input.blocked_by] : undefined,
        comments: [],
        created_at: now(),
        updated_at: now(),
      };
      this.board.tasks.push(task);
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  async listTasks(status?: Status): Promise<Task[]> {
    const tasks = status ? this.board.tasks.filter((t) => t.status === status) : this.board.tasks;
    return structuredClone(tasks);
  }

  async claimTask(input: {
    id: string;
    agent_id: string;
  }): Promise<
    Result<
      Task,
      | Err<"not_found">
      | Err<"wrong_status", { status: Status }>
      | Err<"already_claimed", { claimed_by: string }>
      | Err<"blocked", { blockers: string[] }>
    >
  > {
    return this.mutex.run(async () => {
      const task = this.findById(input.id);
      if (!task) return { ok: false, code: "not_found" };
      if (task.status !== "todo") {
        if (task.assignee) return { ok: false, code: "already_claimed", claimed_by: task.assignee };
        return { ok: false, code: "wrong_status", status: task.status };
      }
      const openBlockers = this.openBlockers(task);
      if (openBlockers.length > 0) return { ok: false, code: "blocked", blockers: openBlockers };
      task.status = "in_progress";
      task.assignee = input.agent_id;
      task.updated_at = now();
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  async addComment(input: {
    id: string;
    author: string;
    body: string;
  }): Promise<Result<Task, Err<"not_found">>> {
    return this.mutex.run(async () => {
      const task = this.findById(input.id);
      if (!task) return { ok: false, code: "not_found" };
      task.comments.push({ author: input.author, body: input.body, at: now() });
      task.updated_at = now();
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  async completeTask(input: {
    id: string;
    agent_id: string;
  }): Promise<
    Result<
      Task,
      | Err<"not_found">
      | Err<"wrong_status", { status: Status }>
      | Err<"not_assignee", { assignee: string | null }>
    >
  > {
    return this.mutex.run(async () => {
      const task = this.findById(input.id);
      if (!task) return { ok: false, code: "not_found" };
      if (task.status !== "in_progress")
        return { ok: false, code: "wrong_status", status: task.status };
      if (task.assignee !== input.agent_id)
        return { ok: false, code: "not_assignee", assignee: task.assignee ?? null };
      task.status = "done";
      task.needs_human = undefined;
      task.updated_at = now();
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  async releaseTask(input: {
    id: string;
    agent_id: string;
  }): Promise<
    Result<
      Task,
      | Err<"not_found">
      | Err<"wrong_status", { status: Status }>
      | Err<"not_assignee", { assignee: string | null }>
    >
  > {
    return this.mutex.run(async () => {
      const task = this.findById(input.id);
      if (!task) return { ok: false, code: "not_found" };
      if (task.status !== "in_progress")
        return { ok: false, code: "wrong_status", status: task.status };
      if (task.assignee !== input.agent_id)
        return { ok: false, code: "not_assignee", assignee: task.assignee ?? null };
      task.status = "todo";
      task.assignee = undefined;
      task.needs_human = undefined;
      task.updated_at = now();
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  async blockTask(input: {
    id: string;
    blocked_by: string[];
  }): Promise<Result<Task, Err<"not_found">>> {
    return this.mutex.run(async () => {
      const task = this.findById(input.id);
      if (!task) return { ok: false, code: "not_found" };
      const merged = new Set([...(task.blocked_by ?? []), ...input.blocked_by]);
      merged.delete(task.id);
      task.blocked_by = merged.size ? [...merged] : undefined;
      task.updated_at = now();
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  async unblockTask(input: {
    id: string;
    blocker_ids: string[];
  }): Promise<Result<Task, Err<"not_found">>> {
    return this.mutex.run(async () => {
      const task = this.findById(input.id);
      if (!task) return { ok: false, code: "not_found" };
      const remove = new Set(input.blocker_ids);
      const remaining = (task.blocked_by ?? []).filter((id) => !remove.has(id));
      task.blocked_by = remaining.length ? remaining : undefined;
      task.updated_at = now();
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  async requestHuman(input: {
    id: string;
    reason?: string;
  }): Promise<Result<Task, Err<"not_found">>> {
    return this.mutex.run(async () => {
      const task = this.findById(input.id);
      if (!task) return { ok: false, code: "not_found" };
      task.needs_human = true;
      if (input.reason) {
        task.comments.push({ author: "system", body: `needs human: ${input.reason}`, at: now() });
      }
      task.updated_at = now();
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  async resumeTask(input: { id: string }): Promise<Result<Task, Err<"not_found">>> {
    return this.mutex.run(async () => {
      const task = this.findById(input.id);
      if (!task) return { ok: false, code: "not_found" };
      task.needs_human = undefined;
      task.updated_at = now();
      this.onChange();
      return { ok: true, task: structuredClone(task) };
    });
  }

  // ---- internals ----

  private findById(id: string): Task | undefined {
    return this.board.tasks.find((t) => t.id === id);
  }

  private openBlockers(task: Task): string[] {
    if (!task.blocked_by?.length) return [];
    return task.blocked_by.filter((id) => {
      const b = this.findById(id);
      return !b || b.status !== "done";
    });
  }

  private onChange(): void {
    const snap = structuredClone(this.board);
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch {
        // a broken subscriber shouldn't sink the mutation
      }
    }
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.pendingWrite = this.flush().finally(() => {
        this.pendingWrite = null;
      });
    }, 150);
  }

  private async flush(): Promise<void> {
    const tmp = `${this.filePath}.tmp`;
    const payload = JSON.stringify(this.board, null, 2) + "\n";
    await writeFile(tmp, payload, "utf8");
    await rename(tmp, this.filePath);
  }
}

class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
