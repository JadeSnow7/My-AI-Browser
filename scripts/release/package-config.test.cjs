const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Forge metadata provides the cross-platform executable and Debian description", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"));
  const forgeConfig = require(path.resolve(__dirname, "../../forge.config.cjs"));
  assert.equal(forgeConfig.packagerConfig.executableName, packageJson.name);
  assert.equal(typeof packageJson.description, "string");
  assert.match(packageJson.description.trim(), /\S/);
});
