import type { BaseWindow, WebContentsView } from "electron";
import type {
  AddressOverlayCloseReason,
  AddressOverlayEvent,
  AddressOverlayModel,
} from "../shared/address-overlay";
import type { OverlayPlacement } from "../shared/layout";

type ViewLike = Pick<WebContentsView, "setBounds" | "setVisible" | "webContents">;
type WindowLike = Pick<BaseWindow, "isDestroyed">;

/**
 * Owns the lifetime and focus gate for the small native address view.
 *
 * A model can arrive before the local page is ready and a ready page can still
 * be blank for one paint. The controller keeps both barriers explicit so a
 * white/empty native rectangle is never exposed to the user.
 */
export class AddressOverlayController {
  private currentView: ViewLike;
  private model: AddressOverlayModel | null = null;
  private pending: AddressOverlayModel | null = null;
  private painted = false;
  private ready = false;
  private closed = false;
  private modal = false;
  private placement: OverlayPlacement | undefined;
  private layoutRevision = -1;
  private focusedRequest = 0;
  private readonly retired = new Set<string>();

  constructor(
    private readonly window: WindowLike,
    view: ViewLike,
    private readonly onEvent: (event: AddressOverlayEvent) => void = () => {},
  ) {
    this.currentView = view;
  }

  get view(): ViewLike {
    return this.currentView;
  }

  /** Swap a crashed WebContentsView without changing the Shell contract. */
  replaceView(view: ViewLike): void {
    this.currentView = view;
    this.ready = false;
    this.painted = false;
    this.closed = false;
    this.pending = this.model;
  }

  loadReady(): void {
    if (this.ready) return;
    this.ready = true;
    if (this.pending) this.sendModel(this.pending);
  }

  open(model: AddressOverlayModel): void {
    if (this.retired.has(model.sessionId)) return;
    const sameSession = this.model?.sessionId === model.sessionId;
    this.closed = false;
    this.model = model;
    this.pending = model;
    if (!sameSession) {
      this.painted = false;
      this.focusedRequest = 0;
      this.currentView.setVisible(false);
    }
    if (this.ready) this.sendModel(model);
  }

  applyPlacement(
    placement: OverlayPlacement | undefined,
    revision: number,
    modal = false,
  ): void {
    if (revision < this.layoutRevision) return;
    this.layoutRevision = revision;
    this.placement = placement;
    this.modal = modal;

    const visible = Boolean(
      placement?.visible &&
        this.model &&
        placement.sessionId === this.model.sessionId &&
        this.ready &&
        this.painted &&
        !this.modal,
    );
    if (
      placement?.visible &&
      placement.sessionId === this.model?.sessionId
    ) {
      this.currentView.setBounds(placement.rect);
    }
    this.currentView.setVisible(visible);

    if (
      visible &&
      placement &&
      placement.focusRequest > 0 &&
      placement.focusRequest !== this.focusedRequest
    ) {
      this.focusedRequest = placement.focusRequest;
      this.currentView.webContents.focus();
    }
  }

  event(event: AddressOverlayEvent): void {
    if (
      !this.model ||
      this.closed ||
      event.sessionId !== this.model.sessionId
    )
      return;

    if (event.type === "painted") {
      this.painted = true;
      this.applyPlacement(this.placement, this.layoutRevision, this.modal);
    }
    if (event.type === "dismiss") {
      this.close(event.reason);
      return;
    }
    this.onEvent(event);
  }

  close(reason: AddressOverlayCloseReason = "outside"): void {
    if (!this.model) return;
    const sessionId = this.model.sessionId;
    this.onEvent({ type: "dismiss", sessionId, reason });
    this.retired.add(sessionId);
    this.model = null;
    this.pending = null;
    this.closed = true;
    this.painted = false;
    this.placement = undefined;
    this.currentView.setVisible(false);
  }

  currentSession(): string | null {
    return this.model?.sessionId ?? null;
  }

  isVisible(): boolean {
    return Boolean(
      this.model &&
        this.ready &&
        this.painted &&
        this.placement?.visible &&
        this.placement.sessionId === this.model.sessionId &&
        !this.modal,
    );
  }

  destroy(): void {
    this.close("failure");
    if (!this.currentView.webContents.isDestroyed()) this.currentView.webContents.close();
  }

  private sendModel(model: AddressOverlayModel): void {
    if (
      !this.window.isDestroyed() &&
      !this.currentView.webContents.isDestroyed()
    ) {
      this.currentView.webContents.send("address-overlay:model", model);
    }
  }
}
