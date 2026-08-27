import type { BaseWindow, WebContentsView } from "electron";
import {
  emptyLayout,
  rectsEqual,
  stackSignature,
  type LayoutSnapshot,
  type Rect,
} from "../../shared/layout";

/**
 * Applies a Shell-authored {@link LayoutSnapshot} to the real views.
 *
 * Deliberately dumb: it owns no geometry policy, no notion of "sidebar" or
 * "panel", and never inspects UI state. Everything it does is bounded by what
 * the snapshot says, which is what keeps Split View / Runtime Panel / Context
 * Panel from ever touching the main process again.
 *
 * Stacking model: the Shell view is always full-window and sits at the *bottom*
 * of the child list. Page views are drawn above it, so they receive their own
 * clicks and the Shell only gets input where it left a margin uncovered. When
 * `shellOnTop` is set the Shell is raised above everything and swallows input,
 * which is what overlays (palette, Agent Lens, approval modals) need.
 */
export class LayoutApplier {
  private snapshot: LayoutSnapshot = emptyLayout();
  private appliedRects = new Map<string, Rect>();
  private appliedStack = "";
  private shellRect: Rect | null = null;
  private published = false;

  constructor(
    private readonly window: BaseWindow,
    private readonly shell: WebContentsView,
    private readonly getView: (tabId: string) => WebContentsView | undefined,
    private readonly listViews: () => Array<{
      tabId: string;
      view: WebContentsView;
    }>,
  ) {}

  apply(next: LayoutSnapshot): void {
    if (next.revision < this.snapshot.revision) return;
    this.published = true;
    this.snapshot = next;
    this.flush();
  }

  /** False until the Shell renderer has published its first measurement. */
  get hasPublished(): boolean {
    return this.published;
  }

  /**
   * Re-run the last snapshot. Called when the window resizes or the set of
   * live views changes underneath the Shell (tab created, discarded, restored)
   * so geometry survives until the Shell publishes its next measurement.
   */
  reflow(): void {
    this.flush();
  }

  /** Forget cached state for a view that no longer exists. */
  forget(tabId: string): void {
    this.appliedRects.delete(tabId);
    this.appliedStack = "";
  }

  private flush(): void {
    if (this.window.isDestroyed()) return;
    const [width, height] = this.window.getContentSize();

    const shellRect: Rect = { x: 0, y: 0, width, height };
    if (
      !this.shell.webContents.isDestroyed() &&
      (!this.shellRect || !rectsEqual(this.shellRect, shellRect))
    ) {
      this.shell.setBounds(shellRect);
      this.shellRect = shellRect;
    }

    const wanted = new Map(this.snapshot.views.map((v) => [v.tabId, v]));

    for (const { tabId, view } of this.listViews()) {
      if (view.webContents.isDestroyed()) continue;
      const placement = wanted.get(tabId);
      if (!placement || !placement.visible) {
        view.setVisible(false);
        continue;
      }
      const rect = clamp(placement.rect, width, height);
      const previous = this.appliedRects.get(tabId);
      if (!previous || !rectsEqual(previous, rect)) {
        view.setBounds(rect);
        this.appliedRects.set(tabId, rect);
      }
      view.setVisible(true);
    }

    this.restack();
  }

  /**
   * Re-stacking means detaching and re-attaching child views, which is visually
   * expensive, so it only happens when the back-to-front order actually
   * changed -- not on every mouse-driven resize.
   */
  private restack(): void {
    const signature = stackSignature(this.snapshot);
    if (signature === this.appliedStack) return;
    this.appliedStack = signature;

    const ordered: WebContentsView[] = [];
    for (const placement of this.snapshot.views) {
      if (!placement.visible) continue;
      const view = this.getView(placement.tabId);
      if (view && !view.webContents.isDestroyed()) ordered.push(view);
    }

    const back = this.snapshot.shellOnTop ? ordered : [this.shell, ...ordered];
    const front = this.snapshot.shellOnTop ? [this.shell] : [];

    for (const view of [...back, ...front]) {
      if (view.webContents.isDestroyed()) continue;
      this.window.contentView.removeChildView(view);
      this.window.contentView.addChildView(view);
    }
  }
}

/** Keep a view inside the window even if the Shell publishes a stale rect. */
const clamp = (rect: Rect, width: number, height: number): Rect => {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(rect.width), width - x)),
    height: Math.max(1, Math.min(Math.round(rect.height), height - y)),
  };
};
