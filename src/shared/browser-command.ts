import type { CdpDomain } from "./cdp";

export type BrowserCommand =
  | { type: "tab.create"; url?: string }
  | { type: "tab.activate"; tabId: string }
  | { type: "tab.close"; tabId: string }
  /** Tear down the renderer, keep url/title/scroll. */
  | { type: "tab.discard"; tabId: string }
  /** Rebuild a discarded renderer without activating it. */
  | { type: "tab.restore"; tabId: string }
  | { type: "navigation.goto"; tabId: string; url: string }
  | { type: "navigation.back"; tabId: string }
  | { type: "navigation.forward"; tabId: string }
  | { type: "navigation.reload"; tabId: string }
  /**
   * Opens native DevTools, which forcibly takes the CDP target from us.
   * PageSession suspends itself so our own panels degrade instead of breaking.
   */
  | { type: "devtools.toggle"; tabId: string }
  | { type: "cdp.subscribe"; tabId: string; domains: CdpDomain[] }
  | { type: "cdp.unsubscribe"; tabId: string; domains: CdpDomain[] }
  /** Hand keyboard focus back to the active page after an overlay closes. */
  | { type: "focus.page" }
  | { type: "window.action"; action: "minimize" | "maximize" | "close" };
