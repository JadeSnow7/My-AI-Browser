const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("package metadata provides a non-empty Debian maker description", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"));
  assert.equal(typeof packageJson.description, "string");
  assert.match(packageJson.description.trim(), /\S/);
});
