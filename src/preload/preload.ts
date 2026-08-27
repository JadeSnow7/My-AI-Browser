import { contextBridge, ipcRenderer } from "electron";
import type { BrowserCommand } from "../shared/browser-command";
import type { BrowserEvent } from "../shared/browser-event";
import type { CdpDomain } from "../shared/cdp";
import type {
  BrowserBridge,
  Platform,
  PlatformInfo,
  UiSignal,
  WindowAction,
} from "../shared/types";
import type { LayoutSnapshot } from "../shared/layout";

const platform = (process.platform === "win32"
  ? "win32"
  : process.platform === "darwin"
    ? "darwin"
    : "linux") as Platform;

/**
 * macOS keeps its native traffic lights (`titleBarStyle: 'hiddenInset'`), so
 * the Shell must reserve room for them rather than paint its own buttons.
 * Everywhere else the window is truly frameless and the Shell owns the
 * controls. Kept in sync with `platformInfo` in main/browser-window.ts.
 */
const platformInfo: PlatformInfo = {
  platform,
  nativeWindowControls: platform === "darwin",
  trafficLightInset: platform === "darwin" ? 78 : 0,
};

const browser: BrowserBridge = {
  command: (command: BrowserCommand) =>
    ipcRenderer.invoke("browser:command", command),
  getState: () => ipcRenderer.invoke("browser:state"),
  subscribe: (fn: (event: BrowserEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: BrowserEvent) =>
      fn(event);
    ipcRenderer.on("browser:event", listener);
    ipcRenderer.send("browser:subscribe");
    return () => {
      ipcRenderer.removeListener("browser:event", listener);
    };
  },
  onUi: (fn: (signal: UiSignal) => void) => {
    const listener = (_: Electron.IpcRendererEvent, signal: UiSignal) =>
      fn(signal);
    ipcRenderer.on("browser:ui", listener);
    return () => {
      ipcRenderer.removeListener("browser:ui", listener);
    };
  },
  layout: (snapshot: LayoutSnapshot) =>
    ipcRenderer.send("shell:layout", snapshot),
  windowAction: (action: WindowAction) =>
    ipcRenderer.invoke("window:action", action),
  platform: platformInfo,
  cdp: {
    subscribe: (tabId: string, domains: CdpDomain[]) =>
      ipcRenderer.invoke("browser:command", {
        type: "cdp.subscribe",
        tabId,
        domains,
      }),
    unsubscribe: (tabId: string, domains: CdpDomain[]) =>
      ipcRenderer.invoke("browser:command", {
        type: "cdp.unsubscribe",
        tabId,
        domains,
      }),
    send: (tabId: string, method: string, params?: object) =>
      ipcRenderer.invoke("cdp:send", tabId, method, params),
  },
};

contextBridge.exposeInMainWorld("browser", browser);
