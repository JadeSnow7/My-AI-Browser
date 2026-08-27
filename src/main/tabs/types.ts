import type { WebContentsView } from "electron";
import type { BrowserTab } from "../../shared/types";

export interface InternalBrowserTab extends BrowserTab {
  /**
   * Null while the tab is discarded. Everything needed to bring it back
   * (`url`, `title`, `scroll`) lives on the tab record itself, so hibernation
   * costs a reload and nothing else.
   */
  view: WebContentsView | null;
  scroll: { x: number; y: number };
  /** Removes the webContents listeners bound to the current view. */
  detachListeners: (() => void) | null;
}

export interface TabManagerHooks {
  onViewCreated: (tabId: string, view: WebContentsView) => void;
  onViewDestroyed: (tabId: string, view: WebContentsView) => void;
  onTabRemoved: (tabId: string) => void;
}
