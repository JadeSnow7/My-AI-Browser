import type { LayoutSnapshot } from "./layout";
import type { AddressOverlayCloseReason, AddressOverlayEvent, AddressOverlayModel } from "./address-overlay";
import type { CdpDomain, CdpSessionState } from "./cdp";

export type TabState = "loading" | "ready" | "crashed" | "discarded";

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  state: TabState;
  active: boolean;
  /** Epoch ms of the last activation; drives the hibernation sweep. */
  lastActiveAt: number;
  /** True when the renderer has been torn down to reclaim memory. */
  discarded: boolean;
}

export interface PersistedTab {
  id?: string;
  url: string;
  title?: string;
  scroll?: { x: number; y: number };
}

export interface PersistedBrowserState {
  tabs: PersistedTab[];
  activeTabIndex: number;
}

export type SidebarState = "hidden" | "open";

export type UiSignal =
  /** Open the Universal Shell prefilled with the current URL (intent `go`). */
  | "shell-with-url"
  | "toggle-shell"
  | "toggle-sidebar"
  | "toggle-split"
  | "toggle-runtime"
  | "toggle-context"
  | "toggle-keymap"
  | "new-task"
  /** Escape from a page view: close modal surfaces only, leave panels docked. */
  | "collapse-overlays";

export type WindowAction = "minimize" | "maximize" | "close";

export type Platform = "darwin" | "win32" | "linux";

export interface PlatformInfo {
  platform: Platform;
  /**
   * True when the OS draws the window buttons for us (macOS `hiddenInset`).
   * The Shell must then reserve space instead of painting its own controls.
   */
  nativeWindowControls: boolean;
  /** Horizontal space the native controls occupy, in DIP. 0 when we draw them. */
  trafficLightInset: number;
}

export interface BrowserState {
  tabs: BrowserTab[];
  activeTab: BrowserTab | null;
  cdp: CdpSessionState[];
}

export interface BrowserBridge {
  command: (
    command: import("./browser-command").BrowserCommand,
  ) => Promise<void>;
  getState: () => Promise<BrowserState>;
  subscribe: (
    listener: (event: import("./browser-event").BrowserEvent) => void,
  ) => () => void;
  onUi: (listener: (signal: UiSignal) => void) => () => void;
  /** Publish measured geometry. Fire-and-forget, rAF-batched by the caller. */
  layout: (snapshot: LayoutSnapshot) => void;
  windowAction: (action: WindowAction) => Promise<void>;
  platform: PlatformInfo;
  /** Open the bounded address surface without raising the full Shell view. */
  addressOverlay: {
    update: (model: AddressOverlayModel) => void;
    close: (sessionId?: string, reason?: AddressOverlayCloseReason) => void;
    subscribe: (listener: (event: AddressOverlayEvent) => void) => () => void;
  };
  cdp: {
    subscribe: (tabId: string, domains: CdpDomain[]) => Promise<void>;
    unsubscribe: (tabId: string, domains: CdpDomain[]) => Promise<void>;
    send: (tabId: string, method: string, params?: object) => Promise<unknown>;
  };
}
