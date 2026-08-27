import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrowserTab, BrowserBridge, SidebarState } from "../shared/types";
import type { BrowserCommand } from "../shared/browser-command";
import type { BrowserEvent } from "../shared/browser-event";
import type { CdpSessionState } from "../shared/cdp";
import { UniversalShell } from "./components/UniversalShell";
import { WorkspaceRail } from "./components/WorkspaceRail";
import { WindowControls } from "./components/WindowControls";
import { SessionBadge } from "./components/SessionBadge";
import { RuntimePanel } from "./components/RuntimePanel";
import { ContextPanel } from "./components/ContextPanel";
import { PanelResizer } from "./components/PanelResizer";
import { EdgeHandles, type Edge } from "./components/EdgeHandles";
import { AddressLabel } from "./components/AddressLabel";
import { Presence, AgentProgress } from "./components/Presence";
import { FirstRunCard } from "./components/FirstRunCard";
import { ShortcutMap } from "./components/ShortcutMap";
import { ApprovalCard } from "./components/ApprovalCard";
import { Toast } from "./components/Toast";
import { LayoutProvider, ViewSlot } from "./layout/layout-model";
import { topChromeHeight } from "./state/browser-store";
import { tintFor } from "./state/tint";
import { useAgentChannel } from "./state/agent";
import { useConsoleFeed } from "./state/inspector";
import {
  createTask,
  groupTabs,
  pruneWorkspace,
  readWorkspace,
  writeWorkspace,
  type Workspace,
} from "./state/workspace";
import {
  openSession,
  readPreferences,
  writePreferences,
  type Preferences,
} from "./state/preferences";
import {
  clampPanels,
  initialPanels,
  CONTEXT_PANEL,
  RUNTIME_PANEL,
  type PanelState,
  type RuntimeTab,
} from "./state/panels";

declare global {
  interface Window {
    browser: BrowserBridge;
  }
}

const platform = window.browser.platform;

const useViewport = (): { width: number; height: number } => {
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const onResize = (): void =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
};

/** Read once at module load: the launch count has to increment exactly once. */
const SESSION = openSession(readPreferences());

export function App(): React.JSX.Element {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [sessions, setSessions] = useState<Record<string, CdpSessionState>>({});
  const [themes, setThemes] = useState<Record<string, string | null>>({});
  const [preferences, setPreferences] = useState<Preferences>(SESSION.preferences);
  const [workspace, setWorkspace] = useState<Workspace>(readWorkspace);

  const [shellOpen, setShellOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [keymap, setKeymap] = useState(false);
  const [firstRun, setFirstRun] = useState(SESSION.firstRun);

  const [split, setSplit] = useState(false);
  const [panels, setPanels] = useState<PanelState>(() =>
    initialPanels({
      runtimeOpen: SESSION.preferences.runtimeOpen,
      runtimeHeight: SESSION.preferences.runtimeHeight,
      runtimeTab: SESSION.preferences.runtimeTab,
      contextOpen: SESSION.preferences.contextOpen,
      contextWidth: SESSION.preferences.contextWidth,
    }),
  );
  const [railOpen, setRailOpen] = useState(SESSION.preferences.railOpen);
  const [dragging, setDragging] = useState<"runtime" | "context" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const viewport = useViewport();
  const active = tabs.find((t) => t.active) ?? null;
  const activeRef = useRef(active);
  activeRef.current = active;

  const { run, approval, consoleErrors: channelErrors } = useAgentChannel();

  /**
   * The presence area promises to show console errors on the page you are
   * looking at, which means listening whether or not the Console tab is open.
   * This is the one place the Shell holds a CDP subscription the user did not
   * ask for -- scoped to the active tab only, and released the moment it
   * changes. `PageSession` reference-counts the domains and already handles
   * DevTools stealing the target, so the cost is one attachment, not N.
   */
  const consoleEntries = useConsoleFeed(active?.id ?? null, true);
  const consoleErrors =
    channelErrors +
    consoleEntries.filter((entry) => entry.level === "error").length;

  const sidebar: SidebarState = railOpen ? "open" : "hidden";

  const secondary = useMemo(
    () => (split ? (tabs.find((t) => t.id !== active?.id) ?? null) : null),
    [split, tabs, active?.id],
  );

  const topHeight = topChromeHeight();

  /**
   * The strip takes its colour from the page it sits against, so a light page
   * does not get a hard dark seam across the top of the window. Only the
   * segment above the page is tinted -- the segment above the rail stays
   * chrome, because the rail is an instrument and does not belong to the page.
   */
  const tint = tintFor(active ? themes[active.id] : null);

  /**
   * Single source of truth for chrome geometry. Rail width, panel sizes and the
   * order in which they give under pressure are all resolved here against the
   * space that actually exists, so nothing downstream re-derives them.
   */
  const resolved = useMemo(
    () =>
      clampPanels(panels, viewport, {
        sidebar,
        topHeight,
        paneCount: secondary ? 2 : 1,
      }),
    [panels, viewport, sidebar, topHeight, secondary],
  );

  const railWidth = resolved.railWidth;
  const { runtimeOpen, runtimeHeight, contextOpen, contextWidth, runtimeTab } =
    resolved.panels;

  // Persist chrome state. Panel sizes used to reset with the window, which made
  // the resize handles feel like a toy.
  useEffect(() => {
    const next: Preferences = {
      ...preferences,
      railOpen,
      runtimeOpen: panels.runtimeOpen,
      runtimeHeight: panels.runtimeHeight,
      runtimeTab: panels.runtimeTab,
      contextOpen: panels.contextOpen,
      contextWidth: panels.contextWidth,
    };
    writePreferences(next);
  }, [preferences, railOpen, panels]);

  useEffect(() => {
    setWorkspace((current) => {
      const pruned = pruneWorkspace(current, tabs);
      if (pruned !== current) writeWorkspace(pruned);
      return pruned;
    });
  }, [tabs]);

  // A panel forced shut by a shrinking window must say so, otherwise the
  // shortcut looks broken.
  useEffect(() => {
    if (resolved.evicted.length > 0)
      setPanels((current) => ({
        ...current,
        runtimeOpen: resolved.panels.runtimeOpen,
        contextOpen: resolved.panels.contextOpen,
      }));
    const parts = [
      ...resolved.evicted.map((name) => `${name} panel`),
      ...(resolved.railCollapsed ? ["rail degraded to icons"] : []),
    ];
    if (parts.length === 0) return;
    setNotice(`${parts.join(" · ")} — not enough width`);
  }, [resolved]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  /** The first-run card is retired by contact, not by reading. */
  const dismissFirstRun = useCallback((): void => setFirstRun(false), []);

  const markShellUsed = useCallback((): void => {
    setFirstRun(false);
    setPreferences((current) =>
      current.usedShell ? current : { ...current, usedShell: true },
    );
  }, []);

  const run_ = (command: BrowserCommand): Promise<void> =>
    window.browser.command(command);

  /** Overlays hold keyboard focus in the Shell; give it back when they close. */
  const focusPage = (): void => void run_({ type: "focus.page" });

  const closeShell = useCallback((): void => {
    setShellOpen(false);
    setQuery("");
    setSelected(0);
    focusPage();
  }, []);

  const openShell = useCallback(
    (prefill?: string): void => {
      markShellUsed();
      setQuery(prefill ?? "");
      setSelected(0);
      setShellOpen(true);
    },
    [markShellUsed],
  );

  const collapseAll = useCallback((): void => {
    setShellOpen(false);
    setKeymap(false);
    setQuery("");
    setRailOpen(false);
    setPanels((p) => ({ ...p, runtimeOpen: false, contextOpen: false }));
    void window.browser.command({ type: "focus.page" });
  }, []);

  const openRuntime = useCallback(
    (tab?: RuntimeTab): void =>
      setPanels((p) => ({
        ...p,
        runtimeOpen: true,
        // Opening the panel while an agent is working should land on the agent,
        // not on whatever tab was last used.
        runtimeTab: tab ?? p.runtimeTab,
      })),
    [],
  );

  useEffect(() => {
    void window.browser.getState().then((state) => {
      setTabs(state.tabs);
      setSessions(
        Object.fromEntries(state.cdp.map((s) => [s.tabId, s])) as Record<
          string,
          CdpSessionState
        >,
      );
    });

    const offEvents = window.browser.subscribe((event: BrowserEvent) => {
      if (event.type === "tabs.changed") setTabs(event.tabs);
      else if (event.type === "tab.updated")
        setTabs((current) =>
          current.map((tab) => (tab.id === event.tab.id ? event.tab : tab)),
        );
      else if (event.type === "tab.theme")
        setThemes((current) => ({ ...current, [event.tabId]: event.color }));
      else if (event.type === "cdp.status")
        setSessions((current) => ({
          ...current,
          [event.state.tabId]: event.state,
        }));
    });

    const offUi = window.browser.onUi((signal) => {
      dismissFirstRun();
      if (signal === "shell-with-url") openShell(activeRef.current?.url ?? "");
      else if (signal === "toggle-shell")
        setShellOpen((open) => {
          if (open) {
            setQuery("");
            return false;
          }
          markShellUsed();
          return true;
        });
      else if (signal === "toggle-sidebar") setRailOpen((v) => !v);
      else if (signal === "toggle-split") setSplit((v) => !v);
      else if (signal === "toggle-runtime")
        setPanels((p) => ({
          ...p,
          runtimeOpen: !p.runtimeOpen,
          runtimeTab: !p.runtimeOpen && run ? "Agent Log" : p.runtimeTab,
        }));
      else if (signal === "toggle-context")
        setPanels((p) => ({ ...p, contextOpen: !p.contextOpen }));
      else if (signal === "toggle-keymap") setKeymap((v) => !v);
      else if (signal === "new-task") newTask();
      else if (signal === "collapse-overlays") {
        setShellOpen(false);
        setKeymap(false);
      }
    });

    return () => {
      offEvents();
      offUi();
    };
    // `run` is read for the ⌘J landing tab; re-binding on it is cheap and keeps
    // the closure honest.
  }, [dismissFirstRun, openShell, markShellUsed, run]);

  // Keys the Shell itself owns while it has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (firstRun) setFirstRun(false);
      if (event.key !== "Escape") return;
      // Escape closes the modal layer first; only a second one puts the docked
      // panels away, so it never destroys more than the user aimed at.
      if (shellOpen || keymap) {
        setShellOpen(false);
        setKeymap(false);
        focusPage();
      } else collapseAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapseAll, firstRun, shellOpen, keymap]);

  const paneOrder = useMemo(
    () => [active?.id, secondary?.id].filter((id): id is string => Boolean(id)),
    [active?.id, secondary?.id],
  );

  const dragRuntime = useCallback(
    (clientY: number) =>
      setPanels((p) => ({
        ...p,
        runtimeHeight: Math.min(
          RUNTIME_PANEL.max,
          Math.max(RUNTIME_PANEL.min, window.innerHeight - clientY),
        ),
      })),
    [],
  );

  const dragContext = useCallback(
    (clientX: number) =>
      setPanels((p) => ({
        ...p,
        contextWidth: Math.min(
          CONTEXT_PANEL.max,
          Math.max(CONTEXT_PANEL.min, window.innerWidth - clientX),
        ),
      })),
    [],
  );

  const groups = useMemo(() => groupTabs(workspace, tabs), [workspace, tabs]);
  const currentGroup =
    groups.find((group) => group.current) ?? groups[0] ?? null;

  const newTask = useCallback((): void => {
    setWorkspace((current) => {
      const next = createTask(current, `Task ${current.tasks.length + 1}`);
      writeWorkspace(next);
      return next;
    });
    void run_({ type: "tab.create" });
  }, []);

  const selectTask = (taskId: string): void =>
    setWorkspace((current) => {
      const next = { ...current, currentTaskId: taskId };
      writeWorkspace(next);
      return next;
    });

  // Toggle, not open. A handle that only opens leaves the panel it opened with
  // no pointer route back, and the second click on the same spot reads as a
  // broken control.
  const toggleEdge = (edge: Edge): void => {
    dismissFirstRun();
    if (edge === "left") setRailOpen((v) => !v);
    else if (edge === "right")
      setPanels((p) => ({ ...p, contextOpen: !p.contextOpen }));
    else setPanels((p) => ({ ...p, runtimeOpen: !p.runtimeOpen }));
  };

  /** Surfaces that have a design but no backend yet say so, once, in the toast. */
  const unwired = (what: string): void =>
    setNotice(`${what} is not wired up yet`);

  const shellCommands = useMemo(
    () => [
      {
        name: "New Tab",
        hint: "command · ⌘T",
        run: () => void run_({ type: "tab.create" }),
      },
      {
        name: "New Task",
        hint: "command · ⌘⇧T",
        run: () => newTask(),
      },
      {
        name: "Close Tab",
        hint: "command · ⌘W",
        run: () =>
          activeRef.current &&
          void run_({ type: "tab.close", tabId: activeRef.current.id }),
      },
      {
        name: "Reload",
        hint: "command · ⌘R",
        run: () =>
          activeRef.current &&
          void run_({ type: "navigation.reload", tabId: activeRef.current.id }),
      },
      {
        name: runtimeOpen ? "Hide Runtime Panel" : "Show Runtime Panel",
        hint: "command · ⌘J",
        run: () => setPanels((p) => ({ ...p, runtimeOpen: !p.runtimeOpen })),
      },
      {
        name: contextOpen ? "Hide Context Panel" : "Show Context Panel",
        hint: "command · ⌘I",
        run: () => setPanels((p) => ({ ...p, contextOpen: !p.contextOpen })),
      },
      {
        name: railOpen ? "Hide Workspace Rail" : "Show Workspace Rail",
        hint: "command · ⌘B",
        run: () => setRailOpen((v) => !v),
      },
      {
        name: split ? "Exit Split View" : "Split Right",
        hint: "command · ⌘\\",
        run: () => setSplit((v) => !v),
      },
      {
        name: "Keyboard Shortcuts",
        hint: "command · ⌘/",
        run: () => setKeymap(true),
      },
      { name: "Collapse All", hint: "command · ESC", run: collapseAll },
      {
        name: "Discard Background Tab",
        hint: "command",
        run: () => {
          const victim = tabs.find((t) => !t.active && !t.discarded);
          if (victim) void run_({ type: "tab.discard", tabId: victim.id });
        },
      },
      {
        name: "Toggle Native DevTools",
        hint: "command · takes the CDP target",
        run: () =>
          activeRef.current &&
          void run_({ type: "devtools.toggle", tabId: activeRef.current.id }),
      },
      ...(platform.nativeWindowControls
        ? []
        : [
            {
              name: "Minimize Window",
              hint: "command",
              run: () =>
                void run_({ type: "window.action", action: "minimize" as const }),
            },
            {
              name: "Maximize / Restore Window",
              hint: "command",
              run: () =>
                void run_({ type: "window.action", action: "maximize" as const }),
            },
            {
              name: "Close Window",
              hint: "command",
              run: () =>
                void run_({ type: "window.action", action: "close" as const }),
            },
          ]),
    ],
    [runtimeOpen, contextOpen, railOpen, split, tabs, collapseAll, newTask],
  );

  const shellContext = useMemo(
    () => ({
      activeUrl: active?.url ?? "",
      tabCount: currentGroup?.tabs.length ?? tabs.length,
      taskName: currentGroup?.task.name ?? "this task",
      navigate: (url: string) => {
        if (!activeRef.current) return void run_({ type: "tab.create", url });
        void run_({
          type: "navigation.goto",
          tabId: activeRef.current.id,
          url,
        });
      },
      search: (terms: string) => {
        const url = `https://duckduckgo.com/?q=${encodeURIComponent(terms)}`;
        if (!activeRef.current) return void run_({ type: "tab.create", url });
        void run_({
          type: "navigation.goto",
          tabId: activeRef.current.id,
          url,
        });
      },
      unwired,
      commands: shellCommands,
    }),
    [active?.url, currentGroup, tabs.length, shellCommands],
  );

  // Modal surfaces raise the Shell above the page views, and so does a drag:
  // pages are native and would otherwise swallow every pointermove the drag
  // depends on. Everything else stays docked precisely so the page keeps input.
  const raised =
    shellOpen || keymap || dragging !== null || Boolean(approval?.irreversible);

  return (
    <LayoutProvider order={paneOrder} shellOnTop={raised}>
      <div className={dragging ? `shell dragging-${dragging}` : "shell"}>
        {/* The strip spans the whole window and the rail hangs below it. The
            traffic lights are drawn by the OS at the window's top-left corner,
            so whatever occupies that corner has to yield -- putting the rail
            there instead meant its header sat underneath them. */}
        <div
          className={`chrome-top scheme-${tint.scheme}`}
          style={{ height: topHeight }}
        >
          <div className="top-rail-zone" style={{ width: railWidth }} />

          <div
            className="top-page-zone"
            style={{
              background: tint.background,
              // The lights overhang into this zone whenever the rail is
              // narrower than they are.
              paddingLeft: Math.max(0, platform.trafficLightInset - railWidth),
            }}
          >
            <AddressLabel
              url={active?.url ?? ""}
              onOpen={() => openShell(activeRef.current?.url ?? "")}
            />
            <Presence
              run={run}
              approvals={approval ? 1 : 0}
              consoleErrors={consoleErrors}
              onOpenAgentLog={() => openRuntime("Agent Log")}
              onOpenConsole={() => openRuntime("Console")}
              onOpenApproval={() => openRuntime("Agent Log")}
            />
            {active && <SessionBadge session={sessions[active.id]} />}
            {!platform.nativeWindowControls && <WindowControls />}
          </div>

          <AgentProgress run={run} />
        </div>

        <div className="below">
          <div className="rail" style={{ width: railWidth }}>
            {railOpen && (
              <WorkspaceRail
                groups={groups}
                compact={resolved.railCollapsed}
                run={run}
                onActivate={(id) => void run_({ type: "tab.activate", tabId: id })}
                onSelectTask={selectTask}
                onNewTask={newTask}
                onClose={() => setRailOpen(false)}
              />
            )}
          </div>

          <div className={contextOpen ? "body" : "body gutter-right"}>
            <div className={runtimeOpen ? "content" : "content gutter-bottom"}>
              <div className={split ? "panes split" : "panes"}>
                {active && <ViewSlot tabId={active.id} />}
                {secondary && <ViewSlot tabId={secondary.id} />}
              </div>

              {runtimeOpen && (
                <div className="panel-host" style={{ height: runtimeHeight }}>
                  <PanelResizer
                    axis="y"
                    label="Resize runtime panel"
                    onStart={() => setDragging("runtime")}
                    onMove={dragRuntime}
                    onEnd={() => setDragging(null)}
                  />
                  <RuntimePanel
                    tab={runtimeTab}
                    pane={resolved.pane}
                    tabId={active?.id ?? null}
                    tabCount={tabs.filter((t) => !t.discarded).length}
                    discardedCount={tabs.filter((t) => t.discarded).length}
                    session={active ? sessions[active.id] : undefined}
                    run={run}
                    consoleEntries={consoleEntries}
                    onTab={(tab: RuntimeTab) =>
                      setPanels((p) => ({ ...p, runtimeTab: tab }))
                    }
                    onClose={() =>
                      setPanels((p) => ({ ...p, runtimeOpen: false }))
                    }
                  />
                </div>
              )}
            </div>

            {contextOpen && (
              <div className="panel-host" style={{ width: contextWidth }}>
                <PanelResizer
                  axis="x"
                  label="Resize context panel"
                  onStart={() => setDragging("context")}
                  onMove={dragContext}
                  onEnd={() => setDragging(null)}
                />
                <ContextPanel
                  tab={active}
                  onClose={() =>
                    setPanels((p) => ({ ...p, contextOpen: false }))
                  }
                  onAction={(name) => unwired(name.toLowerCase())}
                />
              </div>
            )}
          </div>
        </div>

        <EdgeHandles
          open={{ left: railOpen, right: contextOpen, bottom: runtimeOpen }}
          topHeight={topHeight}
          onToggle={toggleEdge}
        />

        {firstRun && (
          <FirstRunCard
            onDismiss={dismissFirstRun}
            onShortcuts={() => {
              dismissFirstRun();
              setKeymap(true);
            }}
          />
        )}

        {approval && (
          <ApprovalCard
            request={approval}
            onReject={() => unwired("approval routing")}
            onApprove={() => unwired("approval routing")}
            onAlways={() => unwired("standing approvals")}
          />
        )}

        {notice && <Toast message={notice} />}

        {shellOpen && (
          <UniversalShell
            query={query}
            onQuery={setQuery}
            selected={selected}
            onSelected={setSelected}
            onClose={closeShell}
            context={shellContext}
          />
        )}

        {keymap && <ShortcutMap onClose={() => setKeymap(false)} />}
      </div>
    </LayoutProvider>
  );
}
