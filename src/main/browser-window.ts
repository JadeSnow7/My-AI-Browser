import {
  BaseWindow,
  WebContentsView,
  type BaseWindowConstructorOptions,
  type WebContentsView as WebContentsViewType,
} from "electron";
import * as path from "node:path";
import { TabManager } from "./tabs/tab-manager";
import { SessionManager } from "./sessions/session-manager";
import { LayoutApplier } from "./layout/layout-applier";
import { PageSessionManager } from "./cdp/page-session-manager";
import type { BrowserEvent } from "../shared/browser-event";
import type { LayoutSnapshot } from "../shared/layout";
import type { PersistedTab, PlatformInfo } from "../shared/types";

const IS_MAC = process.platform === "darwin";
/** Horizontal room the macOS close/minimise/zoom buttons need, in DIP. */
const TRAFFIC_LIGHT_INSET = 78;
/** How long to wait for the Shell's first measurement before self-rescuing. */
const LAYOUT_FALLBACK_MS = 3000;

/**
 * On macOS `frame: false` also removes the native traffic lights, which is why
 * the previous build had to paint its own. `hiddenInset` keeps the buttons,
 * draws them over the content, and hands us an otherwise chromeless window --
 * closer to the design *and* correct for full-screen, Mission Control, snapping
 * and accessibility, none of which custom buttons get right.
 */
export const platformInfo: PlatformInfo = {
  platform: process.platform === "win32" ? "win32" : IS_MAC ? "darwin" : "linux",
  nativeWindowControls: IS_MAC,
  trafficLightInset: IS_MAC ? TRAFFIC_LIGHT_INSET : 0,
};

const windowOptions = (): BaseWindowConstructorOptions =>
  IS_MAC
    ? {
        width: 1280,
        height: 800,
        backgroundColor: "#101216",
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 16, y: 14 },
      }
    : { width: 1280, height: 800, backgroundColor: "#101216", frame: false };

export class BrowserWindowController {
  readonly window: BaseWindow;
  readonly shell: WebContentsView;
  readonly tabs: TabManager;
  readonly layout: LayoutApplier;
  readonly cdp: PageSessionManager;

  constructor(
    private readonly onEvent: (e: BrowserEvent) => void,
    private readonly onShortcut: (key: string) => void = () => {},
    restore?: { tabs: PersistedTab[]; activeTabIndex: number },
    private readonly onPersist: () => void = () => {},
  ) {
    this.window = new BaseWindow(windowOptions());

    this.shell = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "../preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.window.contentView.addChildView(this.shell);
    this.bindShortcuts(this.shell);

    this.cdp = new PageSessionManager(onEvent);

    this.tabs = new TabManager(
      new SessionManager(),
      (event) => this.onEvent(event),
      () => this.persist(),
      {
        onViewCreated: (tabId, view) => {
          this.window.contentView.addChildView(view);
          this.bindShortcuts(view);
          this.cdp.bind(tabId, view.webContents);
          this.layout.reflow();
        },
        onViewDestroyed: (tabId, view) => {
          this.cdp.release(tabId);
          this.layout.forget(tabId);
          if (!view.webContents.isDestroyed())
            this.window.contentView.removeChildView(view);
          this.layout.reflow();
        },
        onTabRemoved: (tabId) => this.cdp.dispose(tabId),
      },
    );

    this.layout = new LayoutApplier(
      this.window,
      this.shell,
      (tabId) => this.tabs.getView(tabId),
      () => this.tabs.listViews(),
    );

    void this.shell.webContents.loadFile(
      path.join(__dirname, "../shell/index.html"),
    );

    if (restore?.tabs.length)
      this.tabs.restore(restore.tabs, restore.activeTabIndex);
    else this.tabs.createTab();

    this.window.on("resize", () => this.layout.reflow());
    this.window.on("closed", () => this.destroyAll());
    this.layout.reflow();
    this.armLayoutFallback();
  }

  /**
   * The Shell owns geometry, which means a Shell that fails to load would leave
   * every page view hidden and the window blank. If no measurement arrives in
   * time, fall back to showing the active tab full-window so the browser stays
   * usable while the Shell is broken.
   */
  private armLayoutFallback(): void {
    const timer = setTimeout(() => {
      if (this.layout.hasPublished || this.window.isDestroyed()) return;
      const active = this.tabs.getActiveTab();
      if (!active) return;
      const [width, height] = this.window.getContentSize();
      this.layout.apply({
        revision: 0,
        shellOnTop: false,
        views: [
          { tabId: active.id, rect: { x: 0, y: 0, width, height }, visible: true },
        ],
      });
    }, LAYOUT_FALLBACK_MS);
    timer.unref?.();
  }

  /**
   * The Shell publishes geometry; the window merely applies it. There is no
   * `setShellLayout(top, sidebar, palette)` any more -- new panels and split
   * arrangements never reach this file.
   */
  applyLayout(snapshot: LayoutSnapshot): void {
    this.layout.apply(snapshot);
    if (snapshot.shellOnTop && !this.shell.webContents.isDestroyed())
      this.shell.webContents.focus();
  }

  windowAction(action: "minimize" | "maximize" | "close"): void {
    if (action === "close") return this.close();
    if (this.window.isDestroyed()) return;
    if (action === "minimize") this.window.minimize();
    else if (this.window.isMaximized()) this.window.unmaximize();
    else this.window.maximize();
  }

  focusActivePage(): void {
    const active = this.tabs.getActiveTab();
    const wc = active && this.tabs.getView(active.id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.focus();
  }

  focusShell(): void {
    if (!this.shell.webContents.isDestroyed()) this.shell.webContents.focus();
  }

  private bindShortcuts(view: WebContentsViewType): void {
    view.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const key = input.key.toLowerCase();
      const keys = [
        "l",
        "k",
        "b",
        "i",
        "j",
        "t",
        "w",
        "r",
        "[",
        "]",
        "\\",
        "/",
      ];
      if ((input.meta || input.control) && keys.includes(key)) {
        event.preventDefault();
        // Shift is part of the binding for ⌘⇧T (New Task); everything else
        // ignores it, so the Shell gets the modifier rather than guessing.
        this.onShortcut(input.shift ? `shift+${input.key}` : input.key);
        return;
      }
      // Escape is forwarded without preventDefault: pages legitimately use it
      // to dismiss their own dialogs and to stop a load, so the Shell only
      // listens in, it does not consume the key.
      if (key === "escape" && !input.meta && !input.control && !input.alt)
        this.onShortcut("Escape");
    });
  }

  persist(): void {
    this.onPersist();
  }

  destroyAll(): void {
    this.cdp.disposeAll();
    this.tabs.destroyAll();
    if (!this.shell.webContents.isDestroyed()) this.shell.webContents.close();
  }

  close(): void {
    this.destroyAll();
    if (!this.window.isDestroyed()) this.window.close();
  }
}
