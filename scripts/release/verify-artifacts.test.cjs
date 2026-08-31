const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { verifyArtifacts } = require("./verify-artifacts.cjs");

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-artifacts-"));
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

test("rejects stale zero-byte maker output", () => {
  const root = fixture({ "app.zip": "zip", "app.dmg": "dmg", "old.dmg": "" });
  assert.throws(() => verifyArtifacts({ platform: "darwin", dir: root }), /Zero-byte/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("rejects extensionless temporary output", () => {
  const root = fixture({ "app.zip": "zip", "app.dmg": "dmg", zilt43XA: "temporary" });
  assert.throws(() => verifyArtifacts({ platform: "darwin", dir: root }), /Unexpected/);
  fs.rmSync(root, { recursive: true, force: true });
});
