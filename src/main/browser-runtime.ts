import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BrowserCommand } from "../shared/browser-command";
import type { BrowserEvent } from "../shared/browser-event";
import type {
  BrowserState,
  PersistedBrowserState,
  PersistedTab,
  UiSignal,
} from "../shared/types";
import type { LayoutSnapshot } from "../shared/layout";
import { BrowserWindowController } from "./browser-window";

export class BrowserRuntime {
  controller!: BrowserWindowController;
  private listeners = new Set<(e: BrowserEvent) => void>();
  private file = path.join(app.getPath("userData"), "browser-state.json");
  private persistQueued = false;

  start(): void {
    this.controller = new BrowserWindowController(
      (e) => this.broadcast(e),
      (key) => this.handleShortcut(key),
      this.readPersisted(),
      () => this.schedulePersist(),
    );
  }

  private readPersisted(): PersistedBrowserState | undefined {
    try {
      const raw = JSON.parse(
        fs.readFileSync(this.file, "utf8"),
      ) as PersistedBrowserState;
      if (!Array.isArray(raw?.tabs)) return undefined;
      return raw;
    } catch {
      return undefined;
    }
  }

  handleShortcut(key: string): void {
    const active = this.controller?.tabs.getActiveTab();
    const shift = key.startsWith("shift+");
    const k = (shift ? key.slice(6) : key).toLowerCase();
    if (k === "escape") {
      this.controller.shell.webContents.send("browser:ui", "collapse-overlays");
      return;
    }
    // Every surface signal also pulls focus into the Shell, otherwise the key
    // opens a panel the page still owns the keyboard for.
    const surface: Record<string, UiSignal> = {
      l: "shell-with-url",
      k: "toggle-shell",
      b: "toggle-sidebar",
      j: "toggle-runtime",
      i: "toggle-context",
      "\\": "toggle-split",
      "/": "toggle-keymap",
    };
    if (shift && k === "t") {
      this.controller.shell.webContents.send("browser:ui", "new-task");
      this.controller.focusShell();
      return;
    }
    const signal = surface[k];
    if (signal) {
      this.controller.shell.webContents.send("browser:ui", signal);
      this.controller.focusShell();
      return;
    }
    if (k === "t") this.command({ type: "tab.create" });
    else if (k === "w" && active)
      this.command({ type: "tab.close", tabId: active.id });
    else if (k === "r" && active)
      this.command({ type: "navigation.reload", tabId: active.id });
    else if (k === "[" && active)
      this.command({ type: "navigation.back", tabId: active.id });
    else if (k === "]" && active)
      this.command({ type: "navigation.forward", tabId: active.id });
  }

  async command(c: BrowserCommand): Promise<void> {
    const t = this.controller.tabs;
    switch (c.type) {
      case "tab.create":
        t.createTab(c.url);
        break;
      case "tab.activate":
        t.activateTab(c.tabId);
        break;
      case "tab.close":
        t.closeTab(c.tabId);
        break;
      case "tab.discard":
        await t.discard(c.tabId, "manual");
        break;
      case "tab.restore":
        t.restoreTab(c.tabId);
        break;
      case "navigation.goto":
        t.navigate(c.tabId, c.url);
        break;
      case "navigation.back":
        t.goBack(c.tabId);
        break;
      case "navigation.forward":
        t.goForward(c.tabId);
        break;
      case "navigation.reload":
        t.reload(c.tabId);
        break;
      case "devtools.toggle":
        t.toggleDevTools(c.tabId);
        break;
      case "cdp.subscribe":
        await this.controller.cdp.subscribe(c.tabId, c.domains);
        break;
      case "cdp.unsubscribe":
        await this.controller.cdp.unsubscribe(c.tabId, c.domains);
        break;
      case "focus.page":
        this.controller.focusActivePage();
        break;
      case "window.action":
        this.controller.windowAction(c.action);
        break;
    }
  }

  applyLayout(snapshot: LayoutSnapshot): void {
    this.controller?.applyLayout(snapshot);
  }

  subscribe(fn: (e: BrowserEvent) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState(): BrowserState {
    return {
      tabs: this.controller.tabs.getTabs(),
      activeTab: this.controller.tabs.getActiveTab(),
      cdp: this.controller.cdp.states(),
    };
  }

  /**
   * Coalesce writes: a burst of navigation events used to hit the disk once per
   * event, and tab records now carry scroll offsets that change often.
   */
  private schedulePersist(): void {
    if (this.persistQueued) return;
    this.persistQueued = true;
    setTimeout(() => {
      this.persistQueued = false;
      this.persist();
    }, 250).unref?.();
  }

  persist(): void {
    if (!this.controller) return;
    const tabs: PersistedTab[] = this.controller.tabs.toPersisted();
    const active = this.controller.tabs.getActiveTab();
    const activeTabIndex = Math.max(
      0,
      tabs.findIndex((x) => x.id === active?.id),
    );
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ tabs, activeTabIndex }));
    } catch {
      /* a failed session save must never take the browser down */
    }
  }

  private broadcast(e: BrowserEvent): void {
    // High-frequency protocol traffic must not trigger a disk write.
    if (e.type !== "cdp.event" && e.type !== "cdp.status")
      this.schedulePersist();
    this.listeners.forEach((f) => f(e));
  }
}
