import type { BrowserTab } from "./types";
import type { CdpSessionState } from "./cdp";

export type BrowserEvent =
  | { type: "tabs.changed"; tabs: BrowserTab[] }
  | { type: "tab.updated"; tab: BrowserTab }
  | { type: "tab.crashed"; tabId: string }
  | { type: "tab.discarded"; tabId: string; reason: "manual" | "policy" }
  | { type: "tab.restored"; tabId: string }
  | { type: "cdp.status"; state: CdpSessionState }
  | { type: "cdp.event"; tabId: string; method: string; params: unknown };
