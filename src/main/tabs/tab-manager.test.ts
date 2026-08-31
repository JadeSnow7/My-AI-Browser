import assert from "node:assert/strict";
import test from "node:test";
import { isMainDocumentNavigation } from "./navigation";

test("only top-level non-same-document navigation resets console", () => {
  assert.equal(isMainDocumentNavigation(false, true), true);
  assert.equal(isMainDocumentNavigation(true, true), false);
  assert.equal(isMainDocumentNavigation(false, false), false);
});
