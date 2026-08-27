import assert from "node:assert/strict";
import test from "node:test";
import { formatConsoleArgs } from "./inspector";

test("formats console placeholders and consumes %c without applying CSS", () => {
  assert.equal(formatConsoleArgs([
    { value: "%cStatus: %s (%d%%)" },
    { value: "color:red" },
    { value: "ready" },
    { value: 100 },
  ]), "Status: ready (100%)");
});

test("preserves unknown or missing placeholders and appends extra arguments", () => {
  assert.equal(formatConsoleArgs([{ value: "x %s %q" }]), "x %s %q");
  assert.equal(formatConsoleArgs([{ value: "x" }, { description: "object" }]), "x object");
});
