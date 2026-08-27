import test from "node:test";
import assert from "node:assert/strict";
import { closeReturnsFocus, geometry, reduceAddressOverlay, type AddressOverlayState } from "./address-overlay-state";

const open = (mode: "preview" | "edit" | "command" = "preview") => ({ type: "open" as const, sessionId: "s", tabId: "t", mode, querySeed: "https://example.com" });
const initial = (): AddressOverlayState => reduceAddressOverlay(null, open())!;
test("open creates an unpainted opening state", () => { const s = initial(); assert.equal(s.motion, "opening"); assert.equal(s.painted, false); });
test("command open toggles the existing command surface", () => { assert.equal(reduceAddressOverlay(reduceAddressOverlay(null, open("command")), open("command")), null); });
test("preview cannot downgrade edit", () => { const edit = reduceAddressOverlay(null, open("edit"))!; assert.equal(reduceAddressOverlay(edit, open("preview"))!.mode, "edit"); });
test("explicit edit increments focus and seed revision", () => { const s = initial(); const e = reduceAddressOverlay(s, { type: "edit", sessionId: "s" })!; assert.equal(e.focusRequest, s.focusRequest + 1); assert.equal(e.seedRevision, s.seedRevision + 1); });
test("wrong sessions are ignored", () => { const s = initial(); assert.deepEqual(reduceAddressOverlay(s, { type: "painted", sessionId: "other" }), s); });
test("painted then settled reaches stable state", () => { let s = initial(); s = reduceAddressOverlay(s, { type: "painted", sessionId: "s" })!; s = reduceAddressOverlay(s, { type: "settled", sessionId: "s" })!; assert.equal(s.motion, "settled"); assert.equal(s.painted, true); });
test("reduced motion settles open and close immediately", () => { const s = reduceAddressOverlay(null, { ...open("edit"), reducedMotion: true }); assert.equal(s!.motion, "settled"); assert.equal(reduceAddressOverlay(s, { type: "close", sessionId: "s", animated: true }), null); });
test("animated close settles to null", () => { const s = reduceAddressOverlay(initial(), { type: "close", sessionId: "s", animated: true })!; assert.equal(s.motion, "closing"); assert.equal(reduceAddressOverlay(s, { type: "settled", sessionId: "s" }), null); });
test("geometry centers surface and uses moving union frame", () => { const result = geometry(initial(), { x: 20, y: 0, width: 100, height: 30 }, { width: 1000, height: 800 }, 30); assert.equal(result.surface.x, 190); assert.ok(result.frame.width > result.surface.width); });
test("settled frame is tight and height is clamped", () => { let s = reduceAddressOverlay(null, open("edit"))!; s = reduceAddressOverlay(s, { type: "settled", sessionId: "s" })!; s = reduceAddressOverlay(s, { type: "resize", sessionId: "s", height: 900 })!; const result = geometry(s, { x: 0, y: 0, width: 1, height: 1 }, { width: 800, height: 500 }, 30); assert.equal(result.surface.height, 462); assert.equal(result.frame.width, result.surface.width + 12); });
test("only escape and submit return focus", () => { assert.equal(closeReturnsFocus("escape"), true); assert.equal(closeReturnsFocus("submit"), true); assert.equal(closeReturnsFocus("outside"), false); });
