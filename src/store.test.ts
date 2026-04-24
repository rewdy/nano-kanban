import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store.js";

let dir: string;
let filePath: string;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "nano-kanban-test-"));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  filePath = join(dir, `tasks-${Math.random().toString(36).slice(2)}.json`);
});

async function fresh(): Promise<Store> {
  return Store.load(filePath);
}

describe("Store", () => {
  describe("createTask", () => {
    it("creates a todo with the expected shape", async () => {
      const store = await fresh();
      const { task } = await store.createTask({ title: "A", description: "d" });
      assert.equal(task.status, "todo");
      assert.equal(task.title, "A");
      assert.equal(task.description, "d");
      assert.equal(task.comments.length, 0);
      assert.ok(task.id);
      assert.ok(task.created_at);
      await store.shutdown();
    });
  });

  describe("claimTask", () => {
    it("moves todo → in_progress and records assignee", async () => {
      const store = await fresh();
      const { task } = await store.createTask({ title: "A" });
      const result = await store.claimTask({ id: task.id, agent_id: "alpha" });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.task.status, "in_progress");
        assert.equal(result.task.assignee, "alpha");
      }
      await store.shutdown();
    });

    it("returns already_claimed on contention with claimed_by", async () => {
      const store = await fresh();
      const { task } = await store.createTask({ title: "A" });
      await store.claimTask({ id: task.id, agent_id: "alpha" });
      const second = await store.claimTask({ id: task.id, agent_id: "beta" });
      assert.equal(second.ok, false);
      if (!second.ok) {
        assert.equal(second.code, "already_claimed");
        assert.equal((second as { claimed_by: string }).claimed_by, "alpha");
      }
      await store.shutdown();
    });

    it("returns blocked when a blocker is open, succeeds after it completes", async () => {
      const store = await fresh();
      const a = (await store.createTask({ title: "A" })).task;
      const b = (await store.createTask({ title: "B", blocked_by: [a.id] })).task;

      const blocked = await store.claimTask({ id: b.id, agent_id: "beta" });
      assert.equal(blocked.ok, false);
      if (!blocked.ok) {
        assert.equal(blocked.code, "blocked");
        assert.deepEqual((blocked as { blockers: string[] }).blockers, [a.id]);
      }

      await store.claimTask({ id: a.id, agent_id: "alpha" });
      await store.completeTask({ id: a.id, agent_id: "alpha" });

      const retry = await store.claimTask({ id: b.id, agent_id: "beta" });
      assert.equal(retry.ok, true);
      await store.shutdown();
    });

    it("returns not_found for unknown id", async () => {
      const store = await fresh();
      const result = await store.claimTask({ id: "nope", agent_id: "alpha" });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "not_found");
      await store.shutdown();
    });
  });

  describe("completeTask", () => {
    it("rejects non-assignees with not_assignee + the real assignee", async () => {
      const store = await fresh();
      const { task } = await store.createTask({ title: "A" });
      await store.claimTask({ id: task.id, agent_id: "alpha" });
      const result = await store.completeTask({ id: task.id, agent_id: "beta" });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "not_assignee");
        assert.equal((result as { assignee: string | null }).assignee, "alpha");
      }
      await store.shutdown();
    });

    it("marks done and clears needs_human", async () => {
      const store = await fresh();
      const { task } = await store.createTask({ title: "A" });
      await store.claimTask({ id: task.id, agent_id: "alpha" });
      await store.requestHuman({ id: task.id, reason: "help" });
      const result = await store.completeTask({ id: task.id, agent_id: "alpha" });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.task.status, "done");
        assert.equal(result.task.needs_human, undefined);
      }
      await store.shutdown();
    });
  });

  describe("releaseTask", () => {
    it("returns to todo and clears assignee", async () => {
      const store = await fresh();
      const { task } = await store.createTask({ title: "A" });
      await store.claimTask({ id: task.id, agent_id: "alpha" });
      const result = await store.releaseTask({ id: task.id, agent_id: "alpha" });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.task.status, "todo");
        assert.equal(result.task.assignee, undefined);
      }
      await store.shutdown();
    });
  });

  describe("requestHuman / resumeTask", () => {
    it("flips needs_human and appends a system comment with the reason", async () => {
      const store = await fresh();
      const { task } = await store.createTask({ title: "A" });
      await store.claimTask({ id: task.id, agent_id: "alpha" });
      const flared = await store.requestHuman({ id: task.id, reason: "pick API key" });
      assert.equal(flared.ok, true);
      if (flared.ok) {
        assert.equal(flared.task.needs_human, true);
        const last = flared.task.comments.at(-1)!;
        assert.equal(last.author, "system");
        assert.match(last.body, /needs human: pick API key/);
      }

      const resumed = await store.resumeTask({ id: task.id });
      assert.equal(resumed.ok, true);
      if (resumed.ok) assert.equal(resumed.task.needs_human, undefined);
      await store.shutdown();
    });
  });

  describe("addComment", () => {
    it("works on a done task", async () => {
      const store = await fresh();
      const { task } = await store.createTask({ title: "A" });
      await store.claimTask({ id: task.id, agent_id: "alpha" });
      await store.completeTask({ id: task.id, agent_id: "alpha" });
      const result = await store.addComment({ id: task.id, author: "reviewer", body: "lgtm" });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.task.status, "done");
        assert.equal(result.task.comments.at(-1)?.body, "lgtm");
      }
      await store.shutdown();
    });
  });

  describe("persistence", () => {
    it("round-trips through disk", async () => {
      const s1 = await fresh();
      const { task } = await s1.createTask({ title: "persist me" });
      await s1.claimTask({ id: task.id, agent_id: "alpha" });
      await s1.addComment({ id: task.id, author: "alpha", body: "started" });
      await s1.shutdown();

      const s2 = await Store.load(filePath);
      const tasks = await s2.listTasks();
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0]!.title, "persist me");
      assert.equal(tasks[0]!.status, "in_progress");
      assert.equal(tasks[0]!.assignee, "alpha");
      assert.equal(tasks[0]!.comments.length, 1);
      await s2.shutdown();
    });
  });
});
