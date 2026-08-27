/**
 * Chrome DevTools Protocol surface shared by main and Shell.
 *
 * Console, Network, Agent Lens and the agent's own "eyes and hands" all run
 * through one attached session per tab, so attachment state is a first-class,
 * observable thing rather than an implementation detail.
 */

export type CdpDomain =
  | "Runtime"
  | "Log"
  | "Network"
  | "Page"
  | "DOM"
  | "Accessibility"
  | "Input";

export type CdpStatus =
  /** No consumer has asked for a session yet. */
  | "detached"
  /** Attached and replaying every requested domain. */
  | "attached"
  /** Native DevTools owns the target; our panels must degrade. */
  | "suspended-devtools"
  /** Lost the session and retrying with backoff. */
  | "reconnecting"
  /** Gave up after exhausting retries. */
  | "error";

export interface CdpSessionState {
  tabId: string;
  status: CdpStatus;
  domains: CdpDomain[];
  /** Human-readable cause for `suspended-devtools` / `reconnecting` / `error`. */
  reason?: string;
}
