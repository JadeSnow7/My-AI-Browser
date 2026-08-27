import type { BrowserTab } from "./types";
import type { CdpSessionState } from "./cdp";

export type BrowserEvent =
  /** A new document navigation began; in-page history/hash changes do not emit this. */
  | { type: "navigation.started"; tabId: string }
  | { type: "tabs.changed"; tabs: BrowserTab[] }
  | { type: "tab.updated"; tab: BrowserTab }
  | { type: "tab.crashed"; tabId: string }
  | { type: "tab.discarded"; tabId: string; reason: "manual" | "policy" }
  | { type: "tab.restored"; tabId: string }
  /** Page background or `<meta name="theme-color">`, for tinting the top strip. */
  | { type: "tab.theme"; tabId: string; color: string | null }
  | { type: "cdp.status"; state: CdpSessionState }
  | { type: "cdp.event"; tabId: string; method: string; params: unknown };
