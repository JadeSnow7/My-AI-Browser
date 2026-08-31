#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");
const outputPath = path.resolve(projectRoot, "out");
if (outputPath !== path.join(projectRoot, "out")) {
  throw new Error(`Refusing to clean unexpected path: ${outputPath}`);
}

fs.rmSync(outputPath, { recursive: true, force: true });
console.log(`Cleaned ${outputPath}`);
