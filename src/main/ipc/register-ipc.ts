import { ipcMain, type WebContents } from "electron";
import type { BrowserCommand } from "../../shared/browser-command";
import type { BrowserRuntime } from "../browser-runtime";
import type { WindowAction } from "../../shared/types";
import type { LayoutSnapshot } from "../../shared/layout";
import { isOverlayEvent, isOverlayModel } from "../../shared/address-overlay";
import type { AddressOverlayCloseReason } from "../../shared/address-overlay";

/**
 * Only the Shell WebContentsView may talk to the main process. Page renderers
 * are sandboxed and have no preload, but the check stays explicit: everything
 * added later (CDP passthrough, terminal, agent tools) is far more dangerous
 * than tab switching, so the boundary is asserted per channel.
 */
export function registerIpc(runtime: BrowserRuntime): void {
  const browserSubscriptions = new Map<WebContents, () => void>();
  const trusted = (sender: WebContents): boolean =>
    sender === runtime.controller?.shell.webContents;
  const overlay = (sender: WebContents): boolean =>
    sender === runtime.controller?.addressOverlay.webContents;

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
    if (browserSubscriptions.has(event.sender)) return;
    const off = runtime.subscribe((browserEvent) => {
      if (!event.sender.isDestroyed())
        event.sender.send("browser:event", browserEvent);
    });
    browserSubscriptions.set(event.sender, off);
    event.sender.once("destroyed", () => {
      browserSubscriptions.delete(event.sender);
      off();
    });
  });
  ipcMain.on("browser:unsubscribe", (event) => {
    if (!trusted(event.sender)) return;
    browserSubscriptions.get(event.sender)?.();
    browserSubscriptions.delete(event.sender);
  });

  ipcMain.on("shell:layout", (event, snapshot: LayoutSnapshot) => {
    if (trusted(event.sender)) runtime.applyLayout(snapshot);
  });

  ipcMain.on("address-overlay:model", (event, model: unknown) => {
    if (trusted(event.sender) && isOverlayModel(model))
      runtime.controller.openAddressOverlayModel(model);
  });
  ipcMain.on("address-overlay:event", (event, value: unknown) => {
    if (overlay(event.sender) && isOverlayEvent(value))
      runtime.controller.addressOverlayController.event(value);
  });

  ipcMain.on("address-overlay:close", (event, sessionId?: unknown, reason?: unknown) => {
    const allowed = new Set<AddressOverlayCloseReason>(["outside", "escape", "window-blur", "modal", "tab-change", "failure", "submit"]);
    if (trusted(event.sender) && (sessionId === undefined || typeof sessionId === "string")) {
      const closeReason = typeof reason === "string" && allowed.has(reason as AddressOverlayCloseReason)
        ? reason as AddressOverlayCloseReason
        : "outside";
      runtime.controller.closeAddressOverlay(sessionId, closeReason);
    } else if (overlay(event.sender)) runtime.controller.addressOverlayController.close("outside");
  });
  ipcMain.on("address-overlay:ready", (event) => {
    if (overlay(event.sender)) runtime.controller.addressOverlayController.loadReady();
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
