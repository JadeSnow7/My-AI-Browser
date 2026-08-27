import type { WebContents } from "electron";
import type { CdpDomain, CdpSessionState, CdpStatus } from "../../shared/cdp";

/** Domains that need an explicit `<Domain>.enable` round trip. */
const ENABLEABLE: ReadonlySet<CdpDomain> = new Set<CdpDomain>([
  "Runtime",
  "Log",
  "Network",
  "Page",
  "DOM",
]);

const BACKOFF_MS = [250, 500, 1000, 2000, 4000] as const;

/**
 * One CDP session per tab, shared by every consumer (Console panel, Network
 * panel, Agent Lens, the agent's act/observe tools).
 *
 * The hard constraint this class exists to absorb: a `webContents` target can
 * only have one debugger client. Opening native DevTools evicts us, and so does
 * a renderer crash. Rather than letting every consumer discover that
 * independently, the session owns the lifecycle -- it suspends cleanly when
 * DevTools takes over, resumes when DevTools closes, retries with backoff on an
 * unexpected detach, and replays the set of enabled domains after every
 * successful re-attach.
 */
export class PageSession {
  private wc: WebContents | null = null;
  private readonly refcounts = new Map<CdpDomain, number>();
  private status: CdpStatus = "detached";
  private reason: string | undefined;
  private attempt = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  /** True while native DevTools owns the target; suppresses reconnection. */
  private yieldedToDevTools = false;
  private disposed = false;
  private unbind: (() => void) | null = null;

  constructor(
    readonly tabId: string,
    private readonly onStateChange: (state: CdpSessionState) => void,
    private readonly onProtocolEvent: (method: string, params: unknown) => void,
  ) {}

  get state(): CdpSessionState {
    return {
      tabId: this.tabId,
      status: this.status,
      domains: [...this.refcounts.keys()],
      reason: this.reason,
    };
  }

  /**
   * Point the session at a (possibly new) renderer. Called on tab creation and
   * again every time a discarded tab is restored into a fresh WebContentsView.
   */
  bind(wc: WebContents): void {
    if (this.disposed) return;
    this.unbind?.();
    this.wc = wc;
    this.yieldedToDevTools = false;
    this.attachListeners(wc);
    if (this.refcounts.size > 0) void this.ensureAttached();
    else this.setStatus("detached");
  }

  /** Called when the renderer goes away (discard, close, crash). */
  release(): void {
    this.cancelRetry();
    this.unbind?.();
    this.unbind = null;
    this.detachQuietly();
    this.wc = null;
    if (!this.disposed) this.setStatus("detached", "renderer released");
  }

  dispose(): void {
    this.disposed = true;
    this.refcounts.clear();
    this.release();
  }

  async subscribe(domains: CdpDomain[]): Promise<void> {
    for (const domain of domains)
      this.refcounts.set(domain, (this.refcounts.get(domain) ?? 0) + 1);
    await this.ensureAttached();
    await this.enable(domains);
    this.publish();
  }

  async unsubscribe(domains: CdpDomain[]): Promise<void> {
    const dropped: CdpDomain[] = [];
    for (const domain of domains) {
      const next = (this.refcounts.get(domain) ?? 0) - 1;
      if (next > 0) this.refcounts.set(domain, next);
      else if (this.refcounts.delete(domain)) dropped.push(domain);
    }
    if (this.isLive())
      for (const domain of dropped)
        if (ENABLEABLE.has(domain))
          await this.raw(`${domain}.disable`).catch(() => {});
    if (this.refcounts.size === 0) {
      this.cancelRetry();
      this.detachQuietly();
      this.setStatus("detached");
    } else this.publish();
  }

  /**
   * Send a protocol command. Rejects rather than silently no-ops when the
   * session is unavailable, so callers (and the agent) see a real failure
   * instead of a hang.
   */
  async send(method: string, params?: object): Promise<unknown> {
    if (this.status === "suspended-devtools")
      throw new Error(
        `CDP unavailable for ${this.tabId}: native DevTools owns this target`,
      );
    await this.ensureAttached();
    return this.raw(method, params);
  }

  // --- lifecycle -----------------------------------------------------------

  private attachListeners(wc: WebContents): void {
    const onMessage = (
      _e: Electron.Event,
      method: string,
      params: unknown,
    ): void => this.onProtocolEvent(method, params);

    const onDetach = (_e: Electron.Event, reason: string): void =>
      this.handleDetach(reason);

    // DevTools and we are mutually exclusive clients of the same target.
    // Yield deliberately so panels can show "handed over" instead of dying.
    const onDevToolsOpened = (): void => {
      this.yieldedToDevTools = true;
      this.cancelRetry();
      this.detachQuietly();
      this.setStatus("suspended-devtools", "native DevTools is open");
    };
    const onDevToolsClosed = (): void => {
      this.yieldedToDevTools = false;
      this.attempt = 0;
      if (this.refcounts.size > 0) void this.ensureAttached();
      else this.setStatus("detached");
    };
    const onGone = (): void => this.handleDetach("render process gone");

    wc.debugger.on("message", onMessage);
    wc.debugger.on("detach", onDetach);
    wc.on("devtools-opened", onDevToolsOpened);
    wc.on("devtools-closed", onDevToolsClosed);
    wc.on("render-process-gone", onGone);

    this.unbind = () => {
      wc.debugger.removeListener("message", onMessage);
      wc.debugger.removeListener("detach", onDetach);
      wc.removeListener("devtools-opened", onDevToolsOpened);
      wc.removeListener("devtools-closed", onDevToolsClosed);
      wc.removeListener("render-process-gone", onGone);
    };
  }

  private async ensureAttached(): Promise<void> {
    if (this.disposed || this.yieldedToDevTools) return;
    const wc = this.wc;
    if (!wc || wc.isDestroyed()) return;
    if (wc.debugger.isAttached()) {
      if (this.status !== "attached") this.setStatus("attached");
      return;
    }
    if (wc.isDevToolsOpened()) {
      this.yieldedToDevTools = true;
      this.setStatus("suspended-devtools", "native DevTools is open");
      return;
    }
    try {
      wc.debugger.attach("1.3");
      this.attempt = 0;
      this.setStatus("attached");
      await this.enable([...this.refcounts.keys()]);
    } catch (error) {
      this.scheduleRetry(String((error as Error)?.message ?? error));
    }
  }

  /** Re-enable every domain a consumer still holds a reference to. */
  private async enable(domains: CdpDomain[]): Promise<void> {
    if (!this.isLive()) return;
    for (const domain of domains) {
      if (!ENABLEABLE.has(domain)) continue;
      await this.raw(`${domain}.enable`).catch(() => {});
    }
  }

  private handleDetach(reason: string): void {
    if (this.disposed) return;
    // `canceled_by_user` is what Electron reports when DevTools steals the
    // target; the devtools-opened handler has usually already fired, but the
    // ordering is not guaranteed.
    if (this.yieldedToDevTools || this.wc?.isDevToolsOpened()) {
      this.yieldedToDevTools = true;
      this.setStatus("suspended-devtools", "native DevTools is open");
      return;
    }
    if (this.refcounts.size === 0) {
      this.setStatus("detached", reason);
      return;
    }
    this.scheduleRetry(reason);
  }

  private scheduleRetry(reason: string): void {
    this.cancelRetry();
    if (this.attempt >= BACKOFF_MS.length) {
      this.setStatus("error", `gave up reattaching: ${reason}`);
      return;
    }
    const delay = BACKOFF_MS[this.attempt++];
    this.setStatus("reconnecting", `${reason} (retry in ${delay}ms)`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.ensureAttached();
    }, delay);
    this.retryTimer.unref?.();
  }

  private cancelRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private isLive(): boolean {
    const wc = this.wc;
    return !!wc && !wc.isDestroyed() && wc.debugger.isAttached();
  }

  private raw(method: string, params?: object): Promise<unknown> {
    const wc = this.wc;
    if (!wc || wc.isDestroyed() || !wc.debugger.isAttached())
      return Promise.reject(new Error(`no CDP session for ${this.tabId}`));
    return wc.debugger.sendCommand(method, params);
  }

  private detachQuietly(): void {
    const wc = this.wc;
    if (!wc || wc.isDestroyed()) return;
    try {
      if (wc.debugger.isAttached()) wc.debugger.detach();
    } catch {
      /* target already gone */
    }
  }

  private setStatus(status: CdpStatus, reason?: string): void {
    if (this.status === status && this.reason === reason) return;
    this.status = status;
    this.reason = reason;
    this.publish();
  }

  private publish(): void {
    if (!this.disposed) this.onStateChange(this.state);
  }
}
