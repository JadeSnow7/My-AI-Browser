import type { BrowserTab } from "../../shared/types";

export interface HibernationConfig {
  /** Live (non-discarded) background tabs allowed before the sweep bites. */
  maxLiveBackgroundTabs: number;
  /** A tab must have been untouched this long to become a candidate. */
  idleMs: number;
  /** How often the sweep runs. */
  checkIntervalMs: number;
}

export const defaultHibernationConfig: HibernationConfig = {
  maxLiveBackgroundTabs: 8,
  idleMs: 10 * 60_000,
  checkIntervalMs: 30_000,
};

export interface HibernationCandidate {
  tab: BrowserTab;
  /** True when the renderer is producing sound and must be spared. */
  audible: boolean;
}

/**
 * Count-plus-idle policy: predictable and reproducible, unlike memory-pressure
 * heuristics. Only tabs that are *both* over the count budget and idle past the
 * threshold get discarded, oldest first, so a user with three tabs never sees a
 * page reload out from under them.
 */
export function selectForHibernation(
  candidates: HibernationCandidate[],
  config: HibernationConfig,
  now: number,
): string[] {
  const live = candidates.filter(
    ({ tab }) => !tab.active && !tab.discarded && tab.state !== "loading",
  );
  const overBudget = live.length - config.maxLiveBackgroundTabs;
  if (overBudget <= 0) return [];

  return live
    .filter(
      ({ tab, audible }) => !audible && now - tab.lastActiveAt >= config.idleMs,
    )
    .sort((a, b) => a.tab.lastActiveAt - b.tab.lastActiveAt)
    .slice(0, overBudget)
    .map(({ tab }) => tab.id);
}

/** Drives {@link selectForHibernation} on a timer. */
export class HibernationScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly sweep: () => void,
    private readonly config: HibernationConfig = defaultHibernationConfig,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(this.sweep, this.config.checkIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
