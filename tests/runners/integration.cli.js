#!/usr/bin/env node
// ./tests/runners/integration.cli.js
const fs = require("node:fs");
const path = require("node:path");

function listTests(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTests(fullPath);
    return entry.name.endsWith(".test.js") ? [fullPath] : [];
  });
}

for (const file of listTests(path.join("tests", "integration"))) {
  require(path.resolve(file));
}
