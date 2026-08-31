#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const expected = {
  darwin: [".zip", ".dmg"],
  win32: ["Setup.exe", ".nupkg", "RELEASES", ".zip"],
  linux: [".zip", ".deb"],
};

function filesIn(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(entryPath) : [entryPath];
  });
}

function matchesType(platform, filename) {
  if (platform === "win32" && filename === "RELEASES") return true;
  if (platform === "win32" && filename.toLowerCase().endsWith("setup.exe")) return true;
  return expected[platform].some((suffix) => filename.toLowerCase().endsWith(suffix.toLowerCase()));
}

function verifyArtifacts({ platform, dir = "out/make" }) {
  if (!expected[platform]) throw new Error(`Unsupported --platform: ${platform || "missing"}`);
  const root = path.resolve(dir);
  const files = filesIn(root).filter((file) => path.basename(file) !== "SHA256SUMS.txt");
  const unexpected = files.filter((file) => !matchesType(platform, path.basename(file)));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected maker output(s): ${unexpected.map((file) => path.relative(root, file)).join(", ")}`);
  }
  const stale = files.filter((file) => fs.statSync(file).size === 0);
  if (stale.length > 0) {
    throw new Error(`Zero-byte maker output(s): ${stale.map((file) => path.relative(root, file)).join(", ")}`);
  }
  const nonempty = files.filter((file) => fs.statSync(file).size > 0);
  const missing = expected[platform].filter((suffix) => !nonempty.some((file) => {
    const name = path.basename(file).toLowerCase();
    return suffix === "RELEASES" ? name === suffix.toLowerCase() : name.endsWith(suffix.toLowerCase());
  }));
  if (missing.length > 0) throw new Error(`Missing non-empty ${platform} maker output(s): ${missing.join(", ")}`);
  if (nonempty.length === 0) throw new Error(`No non-empty artifacts found under ${root}`);

  const hashLines = nonempty
    .map((file) => {
      const relative = path.relative(root, file).split(path.sep).join("/");
      const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      return { digest, relative };
    })
    .sort((left, right) => left.relative.localeCompare(right.relative, "en"))
    .map(({ digest, relative }) => `${digest}  ${relative}`);
  fs.writeFileSync(path.join(root, "SHA256SUMS.txt"), `${hashLines.join("\n")}\n`);
  return hashLines.length;
}

if (require.main === module) {
  const platformArg = process.argv.find((value) => value.startsWith("--platform="));
  const dirArg = process.argv.find((value) => value.startsWith("--dir="));
  const platform = platformArg?.slice("--platform=".length);
  const count = verifyArtifacts({
    platform,
    dir: dirArg?.slice("--dir=".length) || "out/make",
  });
  console.log(`Verified ${count} non-empty artifact(s) for ${platform}`);
}

module.exports = { verifyArtifacts };
