import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TINT, tintFor } from "./tint";

test("no colour falls back to the original chrome", () => {
  for (const value of [null, undefined, "", "not-a-colour", "chartreuse"])
    assert.deepEqual(tintFor(value), DEFAULT_TINT);
});

test("a transparent background tells us nothing about what the user sees", () => {
  assert.deepEqual(tintFor("rgba(255, 255, 255, 0)"), DEFAULT_TINT);
  assert.deepEqual(tintFor("transparent"), DEFAULT_TINT);
  assert.equal(tintFor("rgba(255, 255, 255, 0.9)").tinted, true);
});

test("both CSS notations parse", () => {
  const long = tintFor("#f5f0e8");
  assert.equal(long.tinted, true);
  assert.equal(long.scheme, "light");

  assert.deepEqual(tintFor("#fff"), tintFor("#ffffff"));
  assert.deepEqual(tintFor("rgb(245, 240, 232)"), long);
  assert.deepEqual(tintFor("rgba(245, 240, 232, 1)"), long);
});

test("a light page gets dark text, a dark page gets light text", () => {
  assert.equal(tintFor("#f5f0e8").scheme, "light");
  assert.equal(tintFor("#ffffff").scheme, "light");
  assert.equal(tintFor("#101216").scheme, "dark");
  assert.equal(tintFor("#000000").scheme, "dark");
});

test("a saturated brand colour is allowed to tint the chrome, not to own it", () => {
  const hot = tintFor("#ff0000");
  assert.notEqual(hot.background, "#ff0000");

  // Still recognisably red in hue, but nowhere near full saturation.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hot.background.slice(i, i + 2), 16));
  assert.ok(r > g && r > b, "hue survives");
  assert.ok(r - Math.max(g, b) < 120, `too saturated: ${hot.background}`);
});

test("never pure black or white, so the page boundary survives", () => {
  assert.notEqual(tintFor("#ffffff").background, "#ffffff");
  assert.notEqual(tintFor("#000000").background, "#000000");
});

test("a near-neutral page passes through almost unchanged", () => {
  // The common case: cream, off-white, near-black. Clamping must not visibly
  // move these, or every ordinary page gets a strip that does not match it.
  for (const source of ["#f5f0e8", "#fafafa", "#1a1a1e"]) {
    const { background } = tintFor(source);
    const channels = [1, 3, 5].map((i) => [
      parseInt(background.slice(i, i + 2), 16),
      parseInt(source.slice(i, i + 2), 16),
    ]);
    for (const [got, want] of channels)
      assert.ok(
        Math.abs(got - want) <= 6,
        `${source} -> ${background}: channel drifted by ${Math.abs(got - want)}`,
      );
  }
});
