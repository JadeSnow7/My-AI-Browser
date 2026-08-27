import test from "node:test";
import assert from "node:assert/strict";
import { isOverlayEvent, isOverlayModel } from "./address-overlay";

test("overlay event validator accepts bounded actions and rejects malformed payloads", () => {
  assert.equal(isOverlayEvent({ sessionId: "s", type: "painted" }), true);
  assert.equal(isOverlayEvent({ sessionId: "s", type: "resize", height: 48 }), true);
  assert.equal(isOverlayEvent({ sessionId: "s", type: "resize", height: 0 }), false);
  assert.equal(isOverlayEvent({ sessionId: "s", type: "action", action: "navigate", payload: "https://example.com" }), true);
  assert.equal(isOverlayEvent({ sessionId: "s", type: "action", action: "eval", payload: "x" }), false);
});

const validModel = {
  sessionId: "s", tabId: "t", mode: "preview", querySeed: "https://example.com/" , seedRevision: 1,
  anchor: { x: 0, y: 0, width: 1280, height: 30 }, surface: { x: 330, y: 38, width: 620, height: 46 },
  motion: "opening", reducedMotion: false,
  context: { activeUrl: "https://example.com/", tabCount: 1, taskName: "Task 1", commands: [{ id: "command:0", name: "New tab", hint: "⌘T" }] },
};

test("overlay model validator checks nested geometry and context", () => {
  assert.equal(isOverlayModel(validModel), true);
  assert.equal(isOverlayModel({ ...validModel, anchor: true }), false);
  assert.equal(isOverlayModel({ ...validModel, surface: true }), false);
  assert.equal(isOverlayModel({ ...validModel, context: true }), false);
});

test("overlay action validator accepts long URLs within protocol budget", () => {
  const url = `https://example.com/${"a".repeat(300)}`;
  assert.equal(isOverlayEvent({ sessionId: "s", type: "action", action: "navigate", payload: url }), true);
});
