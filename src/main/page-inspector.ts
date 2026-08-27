import type { BrowserWindowController } from "./browser-window";

/**
 * Thin adapter over the tab's CDP session. Kept separate from PageSession so
 * the Console/Network panels and the agent's page tools can grow their own
 * facades over the same connection instead of each attaching a debugger.
 */
export class PageInspector {
  constructor(private readonly controller: BrowserWindowController) {}

  async inspectPage(
    tabId: string,
  ): Promise<{ url: string; title: string; documentUrl?: string }> {
    const view = this.controller.tabs.getView(tabId);
    const base = {
      url: view?.webContents.getURL() ?? "",
      title: view?.webContents.getTitle() ?? "",
    };
    try {
      const result = (await this.controller.cdp.send(
        tabId,
        "Runtime.evaluate",
        { expression: "document.location.href", returnByValue: true },
      )) as { result?: { value?: string } };
      return { ...base, documentUrl: result?.result?.value };
    } catch {
      // No session (hibernated tab, or DevTools owns the target) is normal.
      return base;
    }
  }
}
