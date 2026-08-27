/**
 * Shell-side preferences that survive a restart.
 *
 * These are chrome state, not browsing state: panel sizes, which runtime tab
 * was last open, whether the user has met the Universal Shell yet. They belong
 * to the Shell renderer alone -- the main process never reads them and no IPC
 * round-trip is worth a boolean -- so they live in `localStorage` rather than
 * in `browser-state.json` next to the tab records.
 *
 * Reads are total: a missing, truncated or hand-edited value falls back to the
 * default rather than throwing on startup and blanking the window.
 */

import {
  CONTEXT_PANEL,
  RUNTIME_PANEL,
  type RuntimeTab,
  RUNTIME_TABS,
} from "./panels";

const KEY = "shell.preferences.v1";

export interface Preferences {
  /** Launch count, capped. The first-run card shows for the first three. */
  launches: number;
  /** True once ⌘K has been used. Retires the first-run card permanently. */
  usedShell: boolean;
  railOpen: boolean;
  runtimeOpen: boolean;
  runtimeHeight: number;
  runtimeTab: RuntimeTab;
  contextOpen: boolean;
  contextWidth: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  launches: 0,
  usedShell: false,
  railOpen: false,
  runtimeOpen: false,
  runtimeHeight: RUNTIME_PANEL.initial,
  runtimeTab: "Terminal",
  contextOpen: false,
  contextWidth: CONTEXT_PANEL.initial,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

const bool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

/** Sanitises every field, so a corrupted blob degrades to defaults per-key. */
function coerce(raw: unknown): Preferences {
  const source = (raw ?? {}) as Partial<Preferences>;
  return {
    launches: clamp(source.launches, 0, 99, 0),
    usedShell: bool(source.usedShell, false),
    railOpen: bool(source.railOpen, false),
    runtimeOpen: bool(source.runtimeOpen, false),
    runtimeHeight: clamp(
      source.runtimeHeight,
      RUNTIME_PANEL.min,
      RUNTIME_PANEL.max,
      RUNTIME_PANEL.initial,
    ),
    runtimeTab: RUNTIME_TABS.includes(source.runtimeTab as RuntimeTab)
      ? (source.runtimeTab as RuntimeTab)
      : "Terminal",
    contextOpen: bool(source.contextOpen, false),
    contextWidth: clamp(
      source.contextWidth,
      CONTEXT_PANEL.min,
      CONTEXT_PANEL.max,
      CONTEXT_PANEL.initial,
    ),
  };
}

export function readPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? coerce(JSON.parse(raw)) : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* a full or disabled store must never take the Shell down */
  }
}

/**
 * Count this launch and decide whether the first-run card is due.
 *
 * Shown for the first three launches, and never again once ⌘K has been used --
 * the card teaches exactly one thing, so meeting it retires it.
 */
export function openSession(preferences: Preferences): {
  preferences: Preferences;
  firstRun: boolean;
} {
  const next = {
    ...preferences,
    launches: Math.min(99, preferences.launches + 1),
  };
  return { preferences: next, firstRun: !next.usedShell && next.launches <= 3 };
}
