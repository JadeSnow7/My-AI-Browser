import test from "node:test";
import assert from "node:assert/strict";
import type { BrowserTab } from "../../shared/types";
import {
  DEFAULT_TASK,
  createTask,
  emptyWorkspace,
  groupTabs,
  pruneWorkspace,
} from "./workspace";

const tab = (id: string, active = false): BrowserTab => ({
  id,
  title: id,
  url: `https://${id}.example`,
  state: "ready",
  active,
  lastActiveAt: 0,
  discarded: false,
});

test("unassigned tabs fall into the current task", () => {
  // A tab opened with ⌘T belongs to whatever you were doing. An "unsorted"
  // bucket would make the common case the ugly one.
  const groups = groupTabs(emptyWorkspace(), [tab("a", true), tab("b")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].task.id, DEFAULT_TASK.id);
  assert.deepEqual(
    groups[0].tabs.map((t) => t.id),
    ["a", "b"],
  );
});

test("the task holding the active tab is the current one", () => {
  const workspace = createTask(emptyWorkspace(), "Research");
  const research = workspace.tasks[1];
  const assigned = {
    ...workspace,
    assignment: { a: DEFAULT_TASK.id, b: research.id },
  };

  const groups = groupTabs(assigned, [tab("a"), tab("b", true)]);
  assert.equal(groups.find((g) => g.task.id === research.id)?.current, true);
  assert.equal(groups.find((g) => g.task.id === DEFAULT_TASK.id)?.current, false);
});

test("a new task becomes current and does not disturb existing tabs", () => {
  const before = { ...emptyWorkspace(), assignment: { a: DEFAULT_TASK.id } };
  const after = createTask(before, "Research");

  assert.equal(after.tasks.length, 2);
  assert.equal(after.currentTaskId, after.tasks[1].id);
  assert.deepEqual(after.assignment, before.assignment);

  // The existing tab stays where it was; only new tabs join the new task.
  const groups = groupTabs(after, [tab("a", true), tab("b")]);
  assert.deepEqual(
    groups.find((g) => g.task.id === DEFAULT_TASK.id)?.tabs.map((t) => t.id),
    ["a"],
  );
  assert.deepEqual(
    groups.find((g) => g.task.id === after.tasks[1].id)?.tabs.map((t) => t.id),
    ["b"],
  );
});

test("an emptied task survives", () => {
  // A task is an intention, not a container. An empty one is still a place to
  // put the next tab.
  const workspace = createTask(emptyWorkspace(), "Research");
  const groups = groupTabs(workspace, []);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[1].tabs, []);
});

test("assignments to a deleted task fall back rather than vanishing", () => {
  const stale = { ...emptyWorkspace(), assignment: { a: "task-that-is-gone" } };
  const groups = groupTabs(stale, [tab("a", true)]);
  assert.deepEqual(
    groups[0].tabs.map((t) => t.id),
    ["a"],
  );
});

test("pruning forgets closed tabs and is identity when nothing died", () => {
  const workspace = {
    ...emptyWorkspace(),
    assignment: { a: DEFAULT_TASK.id, gone: DEFAULT_TASK.id },
  };

  const pruned = pruneWorkspace(workspace, [tab("a")]);
  assert.deepEqual(pruned.assignment, { a: DEFAULT_TASK.id });

  // Same reference when there was nothing to do -- the caller uses identity to
  // decide whether to write to disk and re-render.
  assert.equal(pruneWorkspace(pruned, [tab("a")]), pruned);
});
