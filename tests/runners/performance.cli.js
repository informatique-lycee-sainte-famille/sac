#!/usr/bin/env node
// ./tests/runners/performance.cli.js
const { spawnSync } = require("node:child_process");

const result = spawnSync(process.execPath, ["tests/performance/load_test.mjs"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
