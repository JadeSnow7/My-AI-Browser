/**
 * Tasks: the layer the rail organises tabs by.
 *
 * A flat strip of tabs answers "what is open" and nothing else. Once an agent
 * is opening pages on your behalf, the useful question is "what is this *for*",
 * so tabs hang under a named task and the rail is two levels deep.
 *
 * This is deliberately Shell-side. The main process owns tab lifecycle and
 * knows nothing about tasks; grouping is a view over the tab list, persisted
 * next to the other chrome preferences. A task that loses all its tabs is not
 * deleted -- it is an intention, and an empty one is still a place to put the
 * next tab.
 */

import type { BrowserTab } from "../../shared/types";

const KEY = "shell.workspace.v1";

export interface Task {
  id: string;
  name: string;
}

export interface Workspace {
  tasks: Task[];
  /** tabId -> taskId. Tabs the map has not seen join the current task. */
  assignment: Record<string, string>;
  currentTaskId: string;
}

export const DEFAULT_TASK: Task = { id: "task-default", name: "Workspace" };

export const emptyWorkspace = (): Workspace => ({
  tasks: [DEFAULT_TASK],
  assignment: {},
  currentTaskId: DEFAULT_TASK.id,
});

export function readWorkspace(): Workspace {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw) as Partial<Workspace>;
    const tasks =
      Array.isArray(parsed.tasks) && parsed.tasks.length > 0
        ? parsed.tasks.filter(
            (t): t is Task =>
              typeof t?.id === "string" && typeof t?.name === "string",
          )
        : [DEFAULT_TASK];
    if (tasks.length === 0) tasks.push(DEFAULT_TASK);
    const currentTaskId = tasks.some((t) => t.id === parsed.currentTaskId)
      ? (parsed.currentTaskId as string)
      : tasks[0].id;
    return {
      tasks,
      assignment:
        parsed.assignment && typeof parsed.assignment === "object"
          ? (parsed.assignment as Record<string, string>)
          : {},
      currentTaskId,
    };
  } catch {
    return emptyWorkspace();
  }
}

export function writeWorkspace(workspace: Workspace): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(workspace));
  } catch {
    /* preferences are a convenience; never fail the render over them */
  }
}

export function createTask(workspace: Workspace, name: string): Workspace {
  const task: Task = { id: `task-${Date.now().toString(36)}`, name };
  return {
    ...workspace,
    tasks: [...workspace.tasks, task],
    currentTaskId: task.id,
  };
}

/**
 * Forget tabs that no longer exist. Without this the assignment map grows for
 * the lifetime of the profile, one dead entry per closed tab.
 */
export function pruneWorkspace(
  workspace: Workspace,
  tabs: BrowserTab[],
): Workspace {
  const live = new Set(tabs.map((tab) => tab.id));
  const assignment: Record<string, string> = {};
  let changed = false;
  for (const [tabId, taskId] of Object.entries(workspace.assignment)) {
    if (live.has(tabId)) assignment[tabId] = taskId;
    else changed = true;
  }
  return changed ? { ...workspace, assignment } : workspace;
}

export interface TaskGroup {
  task: Task;
  tabs: BrowserTab[];
  /** True when this task holds the active tab. */
  current: boolean;
}

/**
 * Project the tab list onto the task list.
 *
 * Unassigned tabs fall into the current task rather than a limbo bucket: a tab
 * opened by ⌘T belongs to whatever you were doing, and inventing an "unsorted"
 * group would make the common case the ugly one.
 */
export function groupTabs(
  workspace: Workspace,
  tabs: BrowserTab[],
): TaskGroup[] {
  const activeTabId = tabs.find((tab) => tab.active)?.id;
  const taskOf = (tab: BrowserTab): string => {
    const assigned = workspace.assignment[tab.id];
    return assigned && workspace.tasks.some((t) => t.id === assigned)
      ? assigned
      : workspace.currentTaskId;
  };
  return workspace.tasks.map((task) => {
    const owned = tabs.filter((tab) => taskOf(tab) === task.id);
    return {
      task,
      tabs: owned,
      current: owned.some((tab) => tab.id === activeTabId),
    };
  });
}
