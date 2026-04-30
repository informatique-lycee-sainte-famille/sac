#!/usr/bin/env node
// ./tests/runners/syntax.cli.js
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOTS = ["src", "tests"];
const EXTENSIONS = new Set([".js", ".mjs"]);
const IGNORED_DIRS = new Set(["node_modules", ".git", "generated"]);

function listCodeFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (IGNORED_DIRS.has(entry.name)) return [];

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listCodeFiles(fullPath);

    return EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

let failed = false;
for (const file of ROOTS.flatMap(listCodeFiles)) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
