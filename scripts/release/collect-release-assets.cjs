#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function filesIn(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(entryPath) : [entryPath];
  });
}

function safeName(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "artifact";
}

function collectReleaseAssets({ input, output, expectedGroups }) {
  const inputRoot = path.resolve(input);
  const outputRoot = path.resolve(output);
  if (!fs.existsSync(inputRoot)) throw new Error(`Missing artifact directory: ${inputRoot}`);
  if (fs.existsSync(outputRoot)) {
    if (!fs.statSync(outputRoot).isDirectory()) throw new Error(`Output path is not a directory: ${outputRoot}`);
    if (fs.readdirSync(outputRoot).length > 0) throw new Error(`Output directory must be empty: ${outputRoot}`);
  }
  fs.mkdirSync(outputRoot, { recursive: true });

  const groups = fs.readdirSync(inputRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (groups.length === 0) throw new Error(`No downloaded artifact groups under ${inputRoot}`);
  const expected = [...new Set(expectedGroups || [])].sort();
  const actual = groups.map((group) => group.name).sort();
  if (expected.length === 0) throw new Error("Expected artifact groups must be provided");
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw new Error(`Artifact groups mismatch; expected ${expected.join(", ")}, found ${actual.join(", ")}`);
  }
  const outputNames = new Set();
  const assets = [];
  for (const group of groups.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const groupRoot = path.join(inputRoot, group.name);
    for (const source of filesIn(groupRoot).sort()) {
      if (path.basename(source) === "SHA256SUMS.txt") continue;
      const relative = path.relative(groupRoot, source).split(path.sep).join("/");
      const outputName = `${safeName(group.name)}--${safeName(relative.replaceAll("/", "--"))}`;
      if (outputNames.has(outputName)) throw new Error(`Duplicate release asset name: ${outputName}`);
      if (fs.statSync(source).size === 0) throw new Error(`Zero-byte release asset: ${source}`);
      outputNames.add(outputName);
      fs.copyFileSync(source, path.join(outputRoot, outputName));
      assets.push(outputName);
    }
  }
  if (assets.length === 0) throw new Error("No release assets found");

  const sums = assets.sort((left, right) => left.localeCompare(right, "en")).map((name) => {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(outputRoot, name))).digest("hex");
    return `${digest}  ${name}`;
  });
  fs.writeFileSync(path.join(outputRoot, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
  return { assets: assets.length, checksum: path.join(outputRoot, "SHA256SUMS.txt") };
}

if (require.main === module) {
  const input = process.argv.find((value) => value.startsWith("--input="))?.slice("--input=".length) || "release-artifacts";
  const output = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length) || "release-assets";
  const groupsArg = process.argv.find((value) => value.startsWith("--expected-groups="))?.slice("--expected-groups=".length);
  const expectedGroups = groupsArg ? groupsArg.split(",").filter(Boolean) : undefined;
  const result = collectReleaseAssets({ input, output, expectedGroups });
  console.log(`Collected ${result.assets} release asset(s) in ${path.resolve(output)}`);
}

module.exports = { collectReleaseAssets };
