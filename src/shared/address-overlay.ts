import type { Rect } from "./layout";

export type OverlayMode = "preview" | "edit" | "command";

export interface OverlayCommand {
  id: string;
  name: string;
  hint: string;
}

export interface OverlayContext {
  activeUrl: string;
  tabCount: number;
  taskName: string;
  commands: OverlayCommand[];
}

export interface AddressOverlayModel {
  sessionId: string;
  tabId: string;
  mode: OverlayMode;
  querySeed: string;
  seedRevision: number;
  anchor: Rect;
  surface: Rect;
  motion: "opening" | "settled" | "closing";
  reducedMotion: boolean;
  context: OverlayContext;
}

export type AddressOverlayCloseReason =
  | "outside"
  | "escape"
  | "window-blur"
  | "modal"
  | "tab-change"
  | "failure"
  | "submit";

export type AddressOverlayEvent =
  | { sessionId: string; type: "painted" | "enter" | "leave" | "edit" | "settled" }
  | { sessionId: string; type: "resize"; height: number }
  | {
      sessionId: string;
      type: "action";
      action: "navigate" | "search" | "command" | "unwired";
      payload: string;
    }
  | { sessionId: string; type: "dismiss"; reason: AddressOverlayCloseReason };

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const bounded = (value: unknown, max = 32768): value is string =>
  typeof value === "string" && value.length <= max;

const validRect = (value: unknown): value is Rect => {
  if (!value || typeof value !== "object") return false;
  const rect = value as Record<string, unknown>;
  return (
    [rect.x, rect.y, rect.width, rect.height].every(finite) &&
    Number(rect.width) > 0 &&
    Number(rect.height) > 0 &&
    Number(rect.width) <= 10000 &&
    Number(rect.height) <= 10000
  );
};

const validCommand = (value: unknown): value is OverlayCommand => {
  if (!value || typeof value !== "object") return false;
  const command = value as Record<string, unknown>;
  return (
    bounded(command.id, 128) &&
    bounded(command.name, 512) &&
    bounded(command.hint, 256)
  );
};

const validContext = (value: unknown): value is OverlayContext => {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  return (
    bounded(context.activeUrl) &&
    finite(context.tabCount) &&
    context.tabCount >= 0 &&
    context.tabCount <= 10000 &&
    bounded(context.taskName, 512) &&
    Array.isArray(context.commands) &&
    context.commands.length <= 200 &&
    context.commands.every(validCommand)
  );
};

export const isOverlayEvent = (value: unknown): value is AddressOverlayEvent => {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (!bounded(event.sessionId, 128) || !bounded(event.type, 32)) return false;

  if (["painted", "enter", "leave", "edit", "settled"].includes(String(event.type)))
    return true;
  if (event.type === "resize")
    return finite(event.height) && event.height > 0 && event.height <= 1200;
  if (event.type === "action")
    return (
      ["navigate", "search", "command", "unwired"].includes(String(event.action)) &&
      bounded(event.payload)
    );
  return (
    event.type === "dismiss" &&
    ["outside", "escape", "window-blur", "modal", "tab-change", "failure", "submit"].includes(
      String(event.reason),
    )
  );
};

export const isOverlayModel = (value: unknown): value is AddressOverlayModel => {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  return (
    bounded(model.sessionId, 128) &&
    bounded(model.tabId, 128) &&
    ["preview", "edit", "command"].includes(String(model.mode)) &&
    bounded(model.querySeed) &&
    finite(model.seedRevision) &&
    model.seedRevision >= 0 &&
    model.seedRevision <= Number.MAX_SAFE_INTEGER &&
    validRect(model.anchor) &&
    validRect(model.surface) &&
    ["opening", "settled", "closing"].includes(String(model.motion)) &&
    typeof model.reducedMotion === "boolean" &&
    validContext(model.context)
  );
};
