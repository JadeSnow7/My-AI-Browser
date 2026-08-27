import { contextBridge, ipcRenderer } from "electron";
import type { AddressOverlayEvent, AddressOverlayModel } from "../shared/address-overlay";

contextBridge.exposeInMainWorld("addressOverlay", {
  ready: () => ipcRenderer.send("address-overlay:ready"),
  subscribeModel: (fn: (model: AddressOverlayModel) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, model: AddressOverlayModel) => fn(model);
    ipcRenderer.on("address-overlay:model", listener);
    return () => ipcRenderer.removeListener("address-overlay:model", listener);
  },
  event: (event: AddressOverlayEvent) => ipcRenderer.send("address-overlay:event", event),
});
