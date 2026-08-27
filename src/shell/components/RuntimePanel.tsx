import React from "react";
import { RUNTIME_TABS, type RuntimeTab } from "../state/panels";
import { useNetworkFeed, type ConsoleEntry } from "../state/inspector";
import type { AgentRun, AgentStep } from "../state/agent";
import type { CdpSessionState } from "../../shared/cdp";

/**
 * The bottom panel: five views onto what is running underneath the page.
 *
 * Console and Network are live -- they subscribe to the tab's existing CDP
 * session. Terminal and Agent Log have their frames and their typography but
 * no source yet, so they say which source is missing rather than showing an
 * empty box that reads as broken. Runtime reports what the Shell can actually
 * measure about itself.
 */
export function RuntimePanel({
  tab,
  onTab,
  onClose,
  pane,
  tabId,
  tabCount,
  discardedCount,
  session,
  run,
  consoleEntries,
}: {
  tab: RuntimeTab;
  onTab: (tab: RuntimeTab) => void;
  onClose: () => void;
  /** Live size of one page pane -- the number the panel scaffold is about. */
  pane: { width: number; height: number };
  tabId: string | null;
  tabCount: number;
  discardedCount: number;
  session: CdpSessionState | undefined;
  run: AgentRun | null;
  /** Owned by App: the presence badge needs the same feed, panel open or not. */
  consoleEntries: ConsoleEntry[];
}): React.JSX.Element {
  return (
    <section className="runtime-panel" aria-label="Runtime panel">
      <header className="panel-tabs">
        {RUNTIME_TABS.map((name) => (
          <button
            key={name}
            className={name === tab ? "panel-tab active" : "panel-tab"}
            onClick={() => onTab(name)}
          >
            {name}
            {/* A run in progress is worth a dot on the tab that shows it --
                the panel is often open on something else. */}
            {name === "Agent Log" && run && <span className="tab-dot" />}
          </button>
        ))}
        <span className="panel-key">⌘J</span>
        <button
          className="panel-close"
          aria-label="Close panel"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="panel-body mono">
        {tab === "Terminal" && <TerminalView />}
        {tab === "Console" && <ConsoleView entries={consoleEntries} />}
        {tab === "Network" && <NetworkView tabId={tabId} />}
        {tab === "Agent Log" && <AgentLogView run={run} />}
        {tab === "Runtime" && (
          <RuntimeView
            pane={pane}
            tabCount={tabCount}
            discardedCount={discardedCount}
            session={session}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Empty states name the source that will fill them, so "nothing here" reads as
 * "not wired yet" rather than "broken".
 */
function Unwired({
  title,
  source,
}: {
  title: string;
  source: string;
}): React.JSX.Element {
  return (
    <div className="unwired">
      <p className="unwired-title">{title}</p>
      <p className="unwired-source">{source}</p>
    </div>
  );
}

function TerminalView(): React.JSX.Element {
  return (
    <Unwired
      title="No shell session"
      source="node-pty in a utility process, rendered with @xterm/xterm"
    />
  );
}

function ConsoleView({
  entries,
}: {
  entries: ConsoleEntry[];
}): React.JSX.Element {
  if (entries.length === 0)
    return (
      <Unwired
        title="No console output"
        source="listening on Runtime.consoleAPICalled + Log.entryAdded"
      />
    );
  return (
    <>
      {entries.map((entry) => (
        <div key={entry.id} className={`console-row ${entry.level}`}>
          <span className="console-glyph">
            {entry.level === "error" ? "✗" : entry.level === "warning" ? "▲" : "›"}
          </span>
          <span className="console-text">{entry.text}</span>
          <span className="console-source">{entry.source}</span>
        </div>
      ))}
    </>
  );
}

const kb = (bytes: number | null): string =>
  bytes === null ? "—" : bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} kB`;

const ms = (value: number | null): string =>
  value === null ? "—" : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;

/** 2xx reads as success, 3xx as a detour, 4xx/5xx as a problem. */
const statusClass = (status: number | null, failed?: boolean): string => {
  if (failed) return "bad";
  if (status === null) return "pending";
  if (status >= 400) return "bad";
  if (status >= 300) return "warn";
  return "ok";
};

function NetworkView({ tabId }: { tabId: string | null }): React.JSX.Element {
  const rows = useNetworkFeed(tabId, true);
  if (rows.length === 0)
    return (
      <Unwired
        title="No requests captured"
        source="listening on Network.requestWillBeSent / responseReceived"
      />
    );
  return (
    <div className="net-table">
      <div className="net-row net-head">
        <span className="net-status">status</span>
        <span className="net-name">name</span>
        <span className="net-size">size</span>
        <span className="net-time">time</span>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="net-row">
          <span className={`net-status ${statusClass(row.status, row.failed)}`}>
            {row.failed ? "err" : (row.status ?? "···")}
          </span>
          <span className="net-name">{row.name}</span>
          <span className="net-size">{kb(row.size)}</span>
          <span className="net-time">{ms(row.time)}</span>
        </div>
      ))}
    </div>
  );
}

/** Shape before colour: the glyph carries the status even in monochrome. */
const STEP_GLYPH: Record<AgentStep["status"], string> = {
  done: "✓",
  running: "◍",
  pending: "○",
  failed: "✗",
};

function AgentLogView({ run }: { run: AgentRun | null }): React.JSX.Element {
  if (!run)
    return (
      <Unwired
        title="No agent running"
        source="append-only agent event stream from the agent process"
      />
    );
  return (
    <>
      {run.steps.map((step, index) => {
        const previous = run.steps[index - 1];
        return (
          <div
            key={step.id}
            className={[
              "agent-row",
              step.status,
              // A failure is a seam in the run, not just a red line.
              step.status === "failed" && previous?.status !== "failed"
                ? "seam"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="agent-glyph">{STEP_GLYPH[step.status]}</span>
            <span className="agent-text">
              {step.text}
              {step.target !== undefined && (
                <>
                  {" "}
                  <span className="agent-target">{step.target}</span>
                </>
              )}
            </span>
            {step.status === "failed" ? (
              <button className="agent-retry">retry</button>
            ) : (
              <span
                className={
                  step.status === "running" ? "agent-time now" : "agent-time"
                }
              >
                {step.status === "running" ? "now" : (step.elapsed ?? "")}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

function RuntimeView({
  pane,
  tabCount,
  discardedCount,
  session,
}: {
  pane: { width: number; height: number };
  tabCount: number;
  discardedCount: number;
  session: CdpSessionState | undefined;
}): React.JSX.Element {
  const rows: Array<[string, React.ReactNode]> = [
    [
      "page pane",
      <span className="rt-accent">
        {pane.width} × {pane.height}
      </span>,
    ],
    ["platform", window.browser.platform.platform],
    ["tabs", `${tabCount} live · ${discardedCount} hibernated`],
    [
      "inspector",
      <span className={session?.status === "attached" ? "rt-ok" : undefined}>
        {session?.status ?? "detached"}
        {session?.reason ? ` · ${session.reason}` : ""}
      </span>,
    ],
    ["cdp domains", session?.domains.join(" · ") || "none"],
    ["dev server", "not started"],
  ];
  return (
    <div className="rt-table">
      {rows.map(([key, value]) => (
        <div key={key} className="rt-row">
          <span className="rt-key">{key}</span>
          <span className="rt-value">{value}</span>
        </div>
      ))}
    </div>
  );
}
