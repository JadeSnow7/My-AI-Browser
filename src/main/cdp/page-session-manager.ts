import type { WebContents } from "electron";
import type { CdpDomain, CdpSessionState } from "../../shared/cdp";
import type { BrowserEvent } from "../../shared/browser-event";
import { PageSession } from "./page-session";

/**
 * Owns one {@link PageSession} per tab and keeps it bound across renderer
 * swaps. A tab that gets discarded and later restored keeps its subscriptions:
 * the Console panel does not have to re-subscribe, it just sees the status go
 * `detached` -> `attached` again.
 */
export class PageSessionManager {
  private readonly sessions = new Map<string, PageSession>();

  constructor(private readonly emit: (event: BrowserEvent) => void) {}

  /** Attach (or re-attach) the session for a tab to a live renderer. */
  bind(tabId: string, wc: WebContents): void {
    this.session(tabId).bind(wc);
  }

  /** The renderer went away but the tab still exists (discard, crash). */
  release(tabId: string): void {
    this.sessions.get(tabId)?.release();
  }

  /** The tab itself is gone. */
  dispose(tabId: string): void {
    this.sessions.get(tabId)?.dispose();
    this.sessions.delete(tabId);
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.dispose(id);
  }

  subscribe(tabId: string, domains: CdpDomain[]): Promise<void> {
    return this.session(tabId).subscribe(domains);
  }

  unsubscribe(tabId: string, domains: CdpDomain[]): Promise<void> {
    return this.sessions.get(tabId)?.unsubscribe(domains) ?? Promise.resolve();
  }

  send(tabId: string, method: string, params?: object): Promise<unknown> {
    return this.session(tabId).send(method, params);
  }

  states(): CdpSessionState[] {
    return [...this.sessions.values()].map((s) => s.state);
  }

  private session(tabId: string): PageSession {
    let session = this.sessions.get(tabId);
    if (!session) {
      session = new PageSession(
        tabId,
        (state) => this.emit({ type: "cdp.status", state }),
        (method, params) =>
          this.emit({ type: "cdp.event", tabId, method, params }),
      );
      this.sessions.set(tabId, session);
    }
    return session;
  }
}
