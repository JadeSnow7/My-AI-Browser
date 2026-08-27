import React from "react";
import type { BrowserTab } from "../../shared/types";
import type { TaskGroup } from "../state/workspace";
import type { AgentRun } from "../state/agent";

const initial = (tab: BrowserTab): string => {
  const source = tab.title || tab.url.replace(/^https?:\/\/(www\.)?/, "");
  return (source.trim()[0] ?? "?").toUpperCase();
};

/**
 * Tabs grouped by the task they belong to.
 *
 * A flat tab strip answers "what is open"; once an agent is opening pages on
 * your behalf the load-bearing question is "what is this for", so the rail is
 * two levels: task, then the tabs underneath it.
 *
 * It pushes content rather than floating over it. Page views are native and
 * composited above the Shell, so a rail that overlaid the page would either be
 * invisible or would have to raise the Shell and eat every page click -- which
 * is also why it toggles on ⌘B instead of appearing on hover.
 */
export function WorkspaceRail({
  groups,
  compact,
  run,
  onActivate,
  onSelectTask,
  onNewTask,
}: {
  groups: TaskGroup[];
  /** Degraded icon strip, used when the window cannot afford the full rail. */
  compact: boolean;
  /** Live agent run, if any -- drives the per-task progress count. */
  run: AgentRun | null;
  onActivate: (id: string) => void;
  onSelectTask: (id: string) => void;
  onNewTask: () => void;
}): React.JSX.Element {
  if (compact) return <CompactRail groups={groups} onActivate={onActivate} onNewTask={onNewTask} />;

  return (
    <nav className="rail-list" aria-label="Workspace">
      <header className="rail-head">
        <span>Workspace</span>
        <span className="rail-key">⌘B</span>
      </header>

      <div className="rail-scroll">
        {groups.map(({ task, tabs, current }) => {
          const running = run?.taskId === task.id;
          return (
            <section key={task.id} className="rail-task">
              <button
                className={current ? "task-row current" : "task-row"}
                onClick={() => onSelectTask(task.id)}
              >
                <span className={running ? "task-dot running" : "task-dot"} />
                <span className="task-name">{task.name}</span>
                <span className={running ? "task-count running" : "task-count"}>
                  {running ? `${run.step}/${run.total}` : tabs.length}
                </span>
              </button>

              {/* Only the task you are in expands. Every task open at once is a
                  flat tab list again, wearing headings. */}
              {current && tabs.length > 0 && (
                <div className="task-tabs">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      className={[
                        "tab-row",
                        tab.active ? "active" : "",
                        tab.discarded ? "discarded" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={
                        tab.discarded
                          ? `${tab.title} (hibernated)`
                          : tab.title
                      }
                      onClick={() => onActivate(tab.id)}
                    >
                      <b>
                        {tab.discarded ? "· " : ""}
                        {tab.title || "Untitled"}
                      </b>
                      <small>{tab.url}</small>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <button className="rail-new" onClick={onNewTask}>
        <span>＋ New Task</span>
        <span className="rail-key">⌘⇧T</span>
      </button>
    </nav>
  );
}

/**
 * The degraded rail. It keeps navigation possible at a fifth of the width by
 * dropping to initials -- the first thing to give under space pressure,
 * because it is navigation rather than the task at hand.
 */
function CompactRail({
  groups,
  onActivate,
  onNewTask,
}: {
  groups: TaskGroup[];
  onActivate: (id: string) => void;
  onNewTask: () => void;
}): React.JSX.Element {
  const tabs = groups.flatMap((group) => group.tabs);
  return (
    <nav className="rail-list compact" aria-label="Workspace">
      <div className="rail-scroll">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={[
              "tab-row",
              tab.active ? "active" : "",
              tab.discarded ? "discarded" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title={tab.discarded ? `${tab.title} (hibernated)` : tab.title}
            onClick={() => onActivate(tab.id)}
          >
            <span className="rail-initial">{initial(tab)}</span>
          </button>
        ))}
      </div>
      <button className="rail-new" title="New task" onClick={onNewTask}>
        ＋
      </button>
    </nav>
  );
}
