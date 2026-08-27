import { app } from "electron";
import { BrowserRuntime } from "./browser-runtime";
import { registerIpc } from "./ipc/register-ipc";
const runtime = new BrowserRuntime();
app.whenReady().then(() => {
  registerIpc(runtime);
  runtime.start();
  app.on("activate", () => {
    if (!runtime.controller?.window || runtime.controller.window.isDestroyed())
      runtime.start();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
