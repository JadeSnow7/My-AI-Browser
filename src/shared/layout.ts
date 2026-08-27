/**
 * Declarative layout contract between the trusted Shell renderer and the main
 * process.
 *
 * The Shell is the single source of truth for geometry: it measures its own DOM
 * and publishes a snapshot. The main process is a dumb executor -- it never
 * computes a rectangle. Adding a panel (Runtime Panel, Context Panel) or a new
 * arrangement (Split View) is therefore a Shell-only change.
 */

/** Device-independent pixels, relative to the window content area. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewPlacement {
  tabId: string;
  rect: Rect;
  /** Painted and hit-testable. Hidden views keep their renderer alive. */
  visible: boolean;
}

/** A small, independent native surface used by transient chrome overlays. */
export interface OverlayPlacement {
  sessionId: string;
  rect: Rect;
  visible: boolean;
  /** Incremented only when the overlay should take keyboard focus. */
  focusRequest: number;
}

export interface LayoutSnapshot {
  /** Monotonic; the applier drops out-of-order snapshots. */
  revision: number;
  /** Every page view the Shell wants on screen, back-to-front. */
  views: ViewPlacement[];
  /**
   * When true the Shell view is raised above all page views and therefore
   * swallows every click (command palette, Agent Lens, approval modals).
   * When false page views sit on top and the Shell only receives clicks in
   * the margins it left uncovered.
   */
  shellOnTop: boolean;
  /** Optional; omitted by older Shell renderers and treated as hidden. */
  addressOverlay?: OverlayPlacement;
}

export const emptyLayout = (): LayoutSnapshot => ({
  revision: 0,
  views: [],
  shellOnTop: false,
  addressOverlay: undefined,
});

export const rectsEqual = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Stable signature of the back-to-front ordering, used to skip re-stacking. */
export const stackSignature = (snapshot: LayoutSnapshot): string =>
  `${snapshot.shellOnTop ? "shell" : "page"}:${snapshot.addressOverlay?.visible ? `overlay:${snapshot.addressOverlay.sessionId}` : ""}:${snapshot.views
    .filter((v) => v.visible)
    .map((v) => v.tabId)
    .join(",")}`;
