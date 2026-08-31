const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { collectReleaseAssets } = require("./collect-release-assets.cjs");

function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "browser-release-")); }

test("collects uniquely named assets and one deterministic checksum file", () => {
  const root = tempRoot();
  const input = path.join(root, "downloaded");
  const output = path.join(root, "release");
  fs.mkdirSync(path.join(input, "browser-macos-arm64"), { recursive: true });
  fs.mkdirSync(path.join(input, "browser-windows-x64"), { recursive: true });
  fs.writeFileSync(path.join(input, "browser-macos-arm64", "app.zip"), "mac");
  fs.writeFileSync(path.join(input, "browser-macos-arm64", "SHA256SUMS.txt"), "old");
  fs.writeFileSync(path.join(input, "browser-windows-x64", "app.zip"), "win");
  const expectedGroups = ["browser-macos-arm64", "browser-windows-x64"];
  const result = collectReleaseAssets({ input, output, expectedGroups });
  assert.equal(result.assets, 2);
  assert.deepEqual(fs.readdirSync(output).sort(), [
    "SHA256SUMS.txt",
    "browser-macos-arm64--app.zip",
    "browser-windows-x64--app.zip",
  ]);
  const checksum = fs.readFileSync(path.join(output, "SHA256SUMS.txt"), "utf8");
  assert.match(checksum, /  browser-macos-arm64--app\.zip\n/);
  assert.match(checksum, /  browser-windows-x64--app\.zip\n/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("fails closed on zero-byte final assets", () => {
  const root = tempRoot();
  const input = path.join(root, "downloaded");
  fs.mkdirSync(path.join(input, "browser-linux-x64"), { recursive: true });
  fs.writeFileSync(path.join(input, "browser-linux-x64", "app.zip"), "");
  assert.throws(() => collectReleaseAssets({
    input,
    output: path.join(root, "release"),
    expectedGroups: ["browser-linux-x64"],
  }), /Zero-byte/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("rejects missing or extra artifact groups", () => {
  const root = tempRoot();
  const input = path.join(root, "downloaded");
  fs.mkdirSync(path.join(input, "browser-macos-arm64"), { recursive: true });
  fs.writeFileSync(path.join(input, "browser-macos-arm64", "app.zip"), "mac");
  assert.throws(() => collectReleaseAssets({
    input,
    output: path.join(root, "release"),
    expectedGroups: ["browser-macos-arm64", "browser-windows-x64"],
  }), /groups mismatch/);
  fs.mkdirSync(path.join(input, "unexpected"));
  assert.throws(() => collectReleaseAssets({
    input,
    output: path.join(root, "release-2"),
    expectedGroups: ["browser-macos-arm64"],
  }), /groups mismatch/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("rejects a non-empty output directory without deleting it", () => {
  const root = tempRoot();
  const input = path.join(root, "downloaded");
  const output = path.join(root, "release");
  fs.mkdirSync(path.join(input, "browser-macos-arm64"), { recursive: true });
  fs.writeFileSync(path.join(input, "browser-macos-arm64", "app.zip"), "mac");
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, "keep.txt"), "keep");
  assert.throws(() => collectReleaseAssets({
    input,
    output,
    expectedGroups: ["browser-macos-arm64"],
  }), /Output directory must be empty/);
  assert.equal(fs.readFileSync(path.join(output, "keep.txt"), "utf8"), "keep");
  fs.rmSync(root, { recursive: true, force: true });
});
