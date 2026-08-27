import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeAddress, normalizeNavigationInput } from "./navigation";

test("keeps complete http URLs unchanged", () => {
  const url = "https://example.com/a?q=two#part";
  assert.equal(normalizeNavigationInput(url), url);
});
test("adds a protocol to domains while preserving the path", () => {
  assert.equal(
    normalizeNavigationInput("example.com/docs?q=1#top"),
    "https://example.com/docs?q=1#top",
  );
});
test("accepts localhost ports", () => {
  assert.equal(
    normalizeNavigationInput("localhost:4173/app"),
    "https://localhost:4173/app",
  );
});
test("searches ordinary sentences", () => {
  assert.ok(
    normalizeNavigationInput("how to test this").includes(
      encodeURIComponent("how to test this"),
    ),
  );
});
test("does not treat unsafe protocols as navigable addresses", () => {
  assert.equal(looksLikeAddress("javascript:alert(1)"), false);
  assert.ok(
    normalizeNavigationInput("javascript:alert(1)").includes(
      "javascript%3Aalert",
    ),
  );
});
