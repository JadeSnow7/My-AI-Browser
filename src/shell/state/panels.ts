/**
 * Panel geometry model.
 *
 * Everything here is Shell-side and pure. Under the declarative layout the main
 * process only receives measured rectangles, so panel sizing, minimum sizes and
 * the "what gives when the window is too small" policy all live in one testable
 * place rather than being smeared across the window controller.
 */

export type RuntimeTab =
  | "Terminal"
  | "Console"
  | "Network"
  | "Agent Log"
  | "Runtime";

export const RUNTIME_TABS: RuntimeTab[] = [
  "Terminal",
  "Console",
  "Network",
  "Agent Log",
  "Runtime",
];

import type { SidebarState } from "../../shared/types";

export interface PanelState {
  runtimeOpen: boolean;
  runtimeHeight: number;
  runtimeTab: RuntimeTab;
  contextOpen: boolean;
  contextWidth: number;
}

export const RUNTIME_PANEL = { min: 120, max: 620, initial: 260 } as const;
export const CONTEXT_PANEL = { min: 260, max: 560, initial: 320 } as const;

/**
 * Floor for a single page pane. Below this a web page stops being usable --
 * most responsive layouts collapse to their mobile breakpoint around 420px, and
 * a viewport shorter than 300px shows almost nothing above the fold.
 */
export const MIN_PANE = { width: 420, height: 300 } as const;

/**
 * Width below which a pane is legal but unpleasant -- most desktop web layouts
 * have collapsed to a single column well before this. Used to decide when the
 * rail should degrade, so there is no band where the window is technically
 * within limits and still miserable to use.
 */
export const COMFORT_PANE_WIDTH = 560;

/**
 * Rail widths. `icon` is the degraded form used when the window cannot afford
 * the full rail -- it keeps the tab list navigable at a fifth of the cost.
 */
export const RAIL_WIDTH = {
  /** Not zero: leaves the Shell a sliver to paint a window-drag edge in. */
  hidden: 8,
  icon: 48,
  open: 240,
} as const;

/**
 * Width the Shell keeps uncovered on the right and bottom of the page area.
 *
 * Page views are composited *above* the Shell, so anything the Shell paints
 * under one is invisible and anything it wants to be clickable has to sit
 * outside. The edge handles -- the only permanent chrome in the default state
 * -- are the whole reason the zero-chrome window is discoverable, so the page
 * gives up 8px to buy them a hit area.
 */
export const EDGE_GUTTER = 8;

export const initialPanels = (seed?: Partial<PanelState>): PanelState => ({
  runtimeOpen: false,
  runtimeHeight: RUNTIME_PANEL.initial,
  runtimeTab: "Terminal",
  contextOpen: false,
  contextWidth: CONTEXT_PANEL.initial,
  ...seed,
});

export interface Viewport {
  width: number;
  height: number;
}

export interface ChromeMetrics {
  sidebar: SidebarState;
  topHeight: number;
  /** 1, or 2 in Split View -- panes divide whatever width is left. */
  paneCount: number;
}

export interface ClampResult {
  panels: PanelState;
  /** Resolved rail width, after any degrade. */
  railWidth: number;
  /** True when an open rail was forced down to the icon strip. */
  railCollapsed: boolean;
  /** Panels that had to close outright because nothing else would fit. */
  evicted: Array<"runtime" | "context">;
  /** Final size of a single page pane, for diagnostics. */
  pane: { width: number; height: number };
}

/**
 * Resolve panel sizes against the space actually available.
 *
 * Order of sacrifice is deliberate: shrink a panel to its minimum first, and
 * only close it when even the minimum would push a pane below the floor. The
 * page is the product; panels are instruments pointed at it.
 */
export function clampPanels(
  state: PanelState,
  viewport: Viewport,
  chrome: ChromeMetrics,
): ClampResult {
  const evicted: Array<"runtime" | "context"> = [];
  const panes = Math.max(1, chrome.paneCount);
  /** 1px separator between split panes. */
  const gutters = panes - 1;
  const widthFloor = MIN_PANE.width * panes + gutters;

  // Step 1: the rail is navigation, not the task at hand, so it is the first
  // thing to give. Degrading 240 -> 48 buys back more room than squeezing the
  // context panel ever could, and costs only the tab titles.
  //
  // The trigger is the comfort width rather than the hard floor: gating on the
  // floor left a band -- 1440 in split view was the worst case -- where the
  // rail stayed full and every pane sat a few pixels above unusable.
  const railOpen = chrome.sidebar === "open";
  const wantsContext = state.contextOpen
    ? clamp(state.contextWidth, CONTEXT_PANEL.min, CONTEXT_PANEL.max)
    : 0;
  const paneWidthWithFullRail =
    (viewport.width -
      RAIL_WIDTH.open -
      (state.contextOpen ? wantsContext : EDGE_GUTTER) -
      gutters) /
    panes;
  const railCollapsed = railOpen && paneWidthWithFullRail < COMFORT_PANE_WIDTH;
  const railWidth = railOpen
    ? railCollapsed
      ? RAIL_WIDTH.icon
      : RAIL_WIDTH.open
    : RAIL_WIDTH.hidden;

  const bodyWidth = Math.max(0, viewport.width - railWidth);
  const bodyHeight = Math.max(0, viewport.height - chrome.topHeight);

  // Step 2: shrink the context panel toward its minimum, and only then close it.
  let contextOpen = state.contextOpen;
  let contextWidth = clamp(state.contextWidth, CONTEXT_PANEL.min, CONTEXT_PANEL.max);
  if (contextOpen) {
    const spare = bodyWidth - widthFloor;
    if (spare < CONTEXT_PANEL.min) {
      contextOpen = false;
      evicted.push("context");
      contextWidth = CONTEXT_PANEL.min;
    } else {
      contextWidth = Math.min(contextWidth, spare);
    }
  }

  let runtimeOpen = state.runtimeOpen;
  let runtimeHeight = clamp(state.runtimeHeight, RUNTIME_PANEL.min, RUNTIME_PANEL.max);
  if (runtimeOpen) {
    const spare = bodyHeight - MIN_PANE.height;
    if (spare < RUNTIME_PANEL.min) {
      runtimeOpen = false;
      evicted.push("runtime");
      runtimeHeight = RUNTIME_PANEL.min;
    } else {
      runtimeHeight = Math.min(runtimeHeight, spare);
    }
  }

  // An open panel already holds the edge, so the handle that opens it needs no
  // room. The gutter is only reserved while the panel is away -- which is
  // exactly when the handle is the only thing advertising it.
  const rightReserve = contextOpen ? contextWidth : EDGE_GUTTER;
  const bottomReserve = runtimeOpen ? runtimeHeight : EDGE_GUTTER;

  const paneWidth = Math.floor((bodyWidth - rightReserve - gutters) / panes);
  const paneHeight = bodyHeight - bottomReserve;

  return {
    panels: {
      ...state,
      contextOpen,
      contextWidth,
      runtimeOpen,
      runtimeHeight,
    },
    railWidth,
    railCollapsed,
    evicted,
    pane: { width: Math.max(0, paneWidth), height: Math.max(0, paneHeight) },
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
