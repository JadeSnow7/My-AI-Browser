import { ipcMain, type WebContents } from "electron";
import type { BrowserCommand } from "../../shared/browser-command";
import type { BrowserRuntime } from "../browser-runtime";
import type { WindowAction } from "../../shared/types";
import type { LayoutSnapshot } from "../../shared/layout";

/**
 * Only the Shell WebContentsView may talk to the main process. Page renderers
 * are sandboxed and have no preload, but the check stays explicit: everything
 * added later (CDP passthrough, terminal, agent tools) is far more dangerous
 * than tab switching, so the boundary is asserted per channel.
 */
export function registerIpc(runtime: BrowserRuntime): void {
  const trusted = (sender: WebContents): boolean =>
    sender === runtime.controller?.shell.webContents;

  const guard =
    <A extends unknown[], R>(fn: (sender: WebContents, ...args: A) => R) =>
    (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent, ...args: A) => {
      if (!trusted(event.sender)) throw new Error("untrusted sender");
      return fn(event.sender, ...args);
    };

  ipcMain.handle(
    "browser:command",
    guard((_s, c: BrowserCommand) => runtime.command(c)),
  );

  ipcMain.handle(
    "browser:state",
    guard(() => runtime.getState()),
  );

  ipcMain.on("browser:subscribe", (event) => {
    if (!trusted(event.sender)) return;
    const off = runtime.subscribe((browserEvent) => {
      if (!event.sender.isDestroyed())
        event.sender.send("browser:event", browserEvent);
    });
    event.sender.once("destroyed", off);
  });

  ipcMain.on("shell:layout", (event, snapshot: LayoutSnapshot) => {
    if (trusted(event.sender)) runtime.applyLayout(snapshot);
  });

  ipcMain.handle(
    "cdp:send",
    guard((_s, tabId: string, method: string, params?: object) =>
      runtime.controller.cdp.send(tabId, method, params),
    ),
  );

  ipcMain.handle(
    "window:action",
    guard((_s, action: WindowAction) => runtime.controller.windowAction(action)),
  );
}
