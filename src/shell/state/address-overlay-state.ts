import type { Rect } from "../../shared/layout";
import type { OverlayMode } from "../../shared/address-overlay";

export type OverlayMotion = "opening" | "settled" | "closing";
export interface AddressOverlayState {
  sessionId: string;
  tabId: string;
  mode: OverlayMode;
  querySeed: string;
  seedRevision: number;
  focusRequest: number;
  motion: OverlayMotion;
  painted: boolean;
  height: number;
  reducedMotion: boolean;
}
export type AddressOverlayEvent =
  | { type: "open"; sessionId: string; tabId: string; mode: OverlayMode; querySeed: string; seedRevision?: number; reducedMotion?: boolean; height?: number }
  | { type: "edit"; sessionId: string; querySeed?: string }
  | { type: "painted"; sessionId: string }
  | { type: "settled"; sessionId: string }
  | { type: "resize"; sessionId: string; height: number }
  | { type: "close"; sessionId: string; animated?: boolean };

export function reduceAddressOverlay(state: AddressOverlayState | null, event: AddressOverlayEvent): AddressOverlayState | null {
  if (event.type === "open") {
    if (state?.sessionId === event.sessionId && state.mode === "command" && event.mode === "command") return null;
    const same = state?.sessionId === event.sessionId;
    const mode = state?.mode === "edit" && event.mode === "preview" ? "edit" : event.mode;
    const explicitEdit = mode === "edit" && (!same || event.mode === "edit");
    const next: AddressOverlayState = {
      sessionId: event.sessionId, tabId: event.tabId, mode, querySeed: event.querySeed,
      seedRevision: event.seedRevision ?? ((state?.seedRevision ?? 0) + 1),
      focusRequest: (state?.focusRequest ?? 0) + (explicitEdit ? 1 : 0), motion: "opening",
      painted: same ? state.painted : false, height: event.height ?? (mode === "preview" ? 82 : 420), reducedMotion: event.reducedMotion ?? false,
    };
    return next.reducedMotion ? { ...next, motion: "settled", painted: true } : next;
  }
  if (!state || state.sessionId !== event.sessionId) return state;
  switch (event.type) {
    case "edit": return { ...state, mode: "edit", querySeed: event.querySeed ?? state.querySeed, focusRequest: state.focusRequest + 1, seedRevision: state.seedRevision + 1, height: Math.max(state.height, 420) };
    case "painted": return { ...state, painted: true };
    case "settled": return state.motion === "closing" ? null : { ...state, motion: "settled" };
    case "resize": return event.height > 0 && Number.isFinite(event.height) ? { ...state, height: event.height } : state;
    case "close": return event.animated && !state.reducedMotion ? { ...state, motion: "closing", painted: false } : null;
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export function geometry(state: AddressOverlayState, anchor: Rect, viewport: { width: number; height: number }, topHeight: number): { surface: Rect; frame: Rect } {
  const width = Math.min(620, Math.max(1, viewport.width - 32));
  const height = state.mode === "preview" ? 82 : clamp(state.height, 82, Math.max(82, viewport.height - topHeight - 8));
  const surface: Rect = { x: Math.round((viewport.width - width) / 2), y: topHeight + 8, width, height };
  const shadow = 6;
  const moving = state.motion === "opening" || state.motion === "closing";
  const raw = moving ? { x: Math.min(anchor.x, surface.x), y: Math.min(anchor.y, surface.y), right: Math.max(anchor.x + anchor.width, surface.x + surface.width), bottom: Math.max(anchor.y + anchor.height, surface.y + surface.height) } : { x: surface.x, y: surface.y, right: surface.x + surface.width, bottom: surface.y + surface.height };
  const frame: Rect = { x: clamp(raw.x - shadow, 0, viewport.width), y: clamp(raw.y - shadow, 0, viewport.height), width: clamp(raw.right - raw.x + shadow * 2, 1, viewport.width), height: clamp(raw.bottom - raw.y + shadow * 2, 1, viewport.height) };
  return { surface, frame };
}

export const closeReturnsFocus = (reason: string): boolean => reason === "escape" || reason === "submit";
