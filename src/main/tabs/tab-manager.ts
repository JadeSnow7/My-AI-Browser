import { WebContentsView } from "electron";
import type { BrowserTab, PersistedTab } from "../../shared/types";
import type { BrowserEvent } from "../../shared/browser-event";
import type { InternalBrowserTab, TabManagerHooks } from "./types";
import { SessionManager } from "../sessions/session-manager";
import {
  defaultHibernationConfig,
  HibernationScheduler,
  selectForHibernation,
  type HibernationConfig,
} from "./hibernation";

const normalize = (raw: string): string => {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
};

/** Best-effort scroll capture; a slow or hung page must not block a discard. */
const SCROLL_CAPTURE_TIMEOUT_MS = 200;

export class TabManager {
  private tabs = new Map<string, InternalBrowserTab>();
  private order: string[] = [];
  private activeId: string | null = null;
  private counter = 0;
  private readonly hibernation: HibernationScheduler;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly emit: (e: BrowserEvent) => void,
    private readonly persist: () => void,
    private readonly hooks: TabManagerHooks,
    private readonly config: HibernationConfig = defaultHibernationConfig,
  ) {
    this.hibernation = new HibernationScheduler(
      () => void this.sweep(),
      config,
    );
    this.hibernation.start();
  }

  // --- creation ------------------------------------------------------------

  createTab(url = "https://example.com"): string {
    const id = `tab-${Date.now()}-${++this.counter}`;
    const tab: InternalBrowserTab = {
      id,
      title: "New Tab",
      url: normalize(url),
      state: "loading",
      active: false,
      lastActiveAt: Date.now(),
      discarded: false,
      view: null,
      scroll: { x: 0, y: 0 },
      detachListeners: null,
    };
    this.tabs.set(id, tab);
    this.order.push(id);
    this.materialize(tab);
    this.activateTab(id);
    return id;
  }

  /** Register a tab without paying for a renderer -- used on cold start. */
  private createDiscardedTab(entry: PersistedTab): string {
    const id = entry.id ?? `tab-${Date.now()}-${++this.counter}`;
    this.tabs.set(id, {
      id,
      title: entry.title || entry.url,
      url: normalize(entry.url),
      state: "discarded",
      active: false,
      lastActiveAt: 0,
      discarded: true,
      view: null,
      scroll: entry.scroll ?? { x: 0, y: 0 },
      detachListeners: null,
    });
    this.order.push(id);
    return id;
  }

  /** Build the renderer for a tab that currently has none. */
  private materialize(tab: InternalBrowserTab): WebContentsView {
    if (tab.view && !tab.view.webContents.isDestroyed()) return tab.view;
    const view = new WebContentsView({
      webPreferences: {
        session: this.sessionManager.getSession(),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    tab.view = view;
    tab.discarded = false;
    tab.state = "loading";
    this.attachEvents(tab, view);
    this.hooks.onViewCreated(tab.id, view);
    void view.webContents.loadURL(tab.url);
    return view;
  }

  private attachEvents(tab: InternalBrowserTab, view: WebContentsView): void {
    const wc = view.webContents;
    const startLoading = (): void => {
      tab.state = "loading";
      this.update(tab);
    };
    const stopLoading = (): void => {
      tab.state = "ready";
      this.update(tab);
    };
    const navigated = (_: unknown, url: string): void => {
      tab.url = url;
      tab.scroll = { x: 0, y: 0 };
      this.update(tab);
    };
    const navigatedInPage = (_: unknown, url: string): void => {
      tab.url = url;
      this.update(tab);
    };
    const titled = (_: unknown, title: string): void => {
      tab.title = title;
      this.update(tab);
    };
    const gone = (): void => {
      tab.state = "crashed";
      this.emit({ type: "tab.crashed", tabId: tab.id });
      this.update(tab);
    };
    const finished = (): void => void this.restoreScroll(tab);

    wc.on("did-start-loading", startLoading);
    wc.on("did-stop-loading", stopLoading);
    wc.on("did-navigate", navigated);
    wc.on("did-navigate-in-page", navigatedInPage);
    wc.on("page-title-updated", titled);
    wc.on("render-process-gone", gone);
    wc.on("did-finish-load", finished);
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) this.createTab(url);
      return { action: "deny" };
    });

    tab.detachListeners = () => {
      wc.removeListener("did-start-loading", startLoading);
      wc.removeListener("did-stop-loading", stopLoading);
      wc.removeListener("did-navigate", navigated);
      wc.removeListener("did-navigate-in-page", navigatedInPage);
      wc.removeListener("page-title-updated", titled);
      wc.removeListener("render-process-gone", gone);
      wc.removeListener("did-finish-load", finished);
    };
  }

  // --- hibernation ---------------------------------------------------------

  /**
   * Tear the renderer down while keeping the tab. `url`, `title` and scroll
   * offset are enough to rebuild it, so the user sees a reload rather than a
   * lost tab.
   */
  async discard(id: string, reason: "manual" | "policy" = "manual"): Promise<void> {
    const tab = this.tabs.get(id);
    if (!tab || tab.discarded || !tab.view) return;
    if (tab.active) return; // never discard what the user is looking at

    tab.scroll = await this.captureScroll(tab);

    const view = tab.view;
    tab.detachListeners?.();
    tab.detachListeners = null;
    tab.view = null;
    tab.discarded = true;
    tab.state = "discarded";

    this.hooks.onViewDestroyed(id, view);
    if (!view.webContents.isDestroyed()) view.webContents.close();

    this.emit({ type: "tab.discarded", tabId: id, reason });
    this.update(tab);
  }

  /** Rebuild a discarded renderer without necessarily activating the tab. */
  restoreTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab || !tab.discarded) return;
    this.materialize(tab);
    this.emit({ type: "tab.restored", tabId: id });
    this.update(tab);
  }

  private async captureScroll(
    tab: InternalBrowserTab,
  ): Promise<{ x: number; y: number }> {
    const wc = tab.view?.webContents;
    if (!wc || wc.isDestroyed()) return tab.scroll;
    try {
      const result = await Promise.race([
        wc.executeJavaScript(
          "({x: window.scrollX || 0, y: window.scrollY || 0})",
          true,
        ),
        new Promise((resolve) =>
          setTimeout(() => resolve(null), SCROLL_CAPTURE_TIMEOUT_MS),
        ),
      ]);
      const scroll = result as { x?: number; y?: number } | null;
      if (scroll && typeof scroll.x === "number" && typeof scroll.y === "number")
        return { x: scroll.x, y: scroll.y };
    } catch {
      /* page navigated away or refused evaluation */
    }
    return tab.scroll;
  }

  private async restoreScroll(tab: InternalBrowserTab): Promise<void> {
    const { x, y } = tab.scroll;
    if (x === 0 && y === 0) return;
    const wc = tab.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    try {
      await wc.executeJavaScript(`window.scrollTo(${x}, ${y})`, true);
    } catch {
      /* best effort */
    }
  }

  private async sweep(): Promise<void> {
    const now = Date.now();
    const candidates = [...this.tabs.values()].map((tab) => ({
      tab: this.public(tab),
      audible: tab.view?.webContents.isCurrentlyAudible() ?? false,
    }));
    for (const id of selectForHibernation(candidates, this.config, now))
      await this.discard(id, "policy");
  }

  // --- navigation & activation --------------------------------------------

  activateTab(id: string): void {
    const target = this.tabs.get(id);
    if (!target) return;
    if (target.discarded) this.materialize(target);
    target.lastActiveAt = Date.now();
    for (const tab of this.tabs.values()) tab.active = tab.id === id;
    this.activeId = id;
    this.persist();
    this.emit({ type: "tabs.changed", tabs: this.getTabs() });
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const view = tab.view;
    tab.detachListeners?.();
    tab.view = null;
    if (view) {
      this.hooks.onViewDestroyed(id, view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    this.tabs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.hooks.onTabRemoved(id);

    if (this.activeId === id) {
      const next = this.order[0];
      this.activeId = null;
      if (next) this.activateTab(next);
      else this.createTab();
    }
    this.persist();
    this.emit({ type: "tabs.changed", tabs: this.getTabs() });
  }

  navigate(id: string, url: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    tab.url = normalize(url);
    tab.scroll = { x: 0, y: 0 };
    const view = tab.discarded ? this.materialize(tab) : tab.view;
    if (view) void view.webContents.loadURL(tab.url);
    this.update(tab);
  }

  goBack(id: string): void {
    const wc = this.liveContents(id);
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(id: string): void {
    const wc = this.liveContents(id);
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (tab.discarded) this.restoreTab(id);
    else tab.view?.webContents.reload();
  }

  toggleDevTools(id: string): void {
    const wc = this.liveContents(id);
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: "detach" });
  }

  // --- queries -------------------------------------------------------------

  getTabs(): BrowserTab[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((t): t is InternalBrowserTab => !!t)
      .map((t) => this.public(t));
  }

  getActiveTab(): BrowserTab | null {
    const tab = this.activeId ? this.tabs.get(this.activeId) : undefined;
    return tab ? this.public(tab) : null;
  }

  getView(id: string): WebContentsView | undefined {
    return this.tabs.get(id)?.view ?? undefined;
  }

  /** Every materialized view, in tab order -- what the layout applier walks. */
  listViews(): Array<{ tabId: string; view: WebContentsView }> {
    const result: Array<{ tabId: string; view: WebContentsView }> = [];
    for (const id of this.order) {
      const view = this.tabs.get(id)?.view;
      if (view) result.push({ tabId: id, view });
    }
    return result;
  }

  toPersisted(): PersistedTab[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((t): t is InternalBrowserTab => !!t)
      .map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        scroll: t.scroll,
      }));
  }

  /**
   * Cold start: only the tab the user will actually look at gets a renderer.
   * The rest come back as discarded records, which is both faster to launch and
   * consistent with what the hibernation policy would have done anyway.
   */
  restore(items: PersistedTab[], activeIndex: number): void {
    const ids = items.map((entry) => this.createDiscardedTab(entry));
    const target = ids[activeIndex] ?? ids[0];
    if (target) this.activateTab(target);
  }

  destroyAll(): void {
    this.hibernation.stop();
    for (const tab of this.tabs.values()) {
      tab.detachListeners?.();
      const view = tab.view;
      tab.view = null;
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
    }
    this.tabs.clear();
    this.order = [];
    this.activeId = null;
  }

  // --- internals -----------------------------------------------------------

  private liveContents(id: string): Electron.WebContents | undefined {
    const wc = this.tabs.get(id)?.view?.webContents;
    return wc && !wc.isDestroyed() ? wc : undefined;
  }

  private update(tab: InternalBrowserTab): void {
    this.persist();
    this.emit({ type: "tab.updated", tab: this.public(tab) });
    this.emit({ type: "tabs.changed", tabs: this.getTabs() });
  }

  private public(t: InternalBrowserTab): BrowserTab {
    return {
      id: t.id,
      title: t.title,
      url: t.url,
      state: t.state,
      active: t.active,
      lastActiveAt: t.lastActiveAt,
      discarded: t.discarded,
    };
  }
}
