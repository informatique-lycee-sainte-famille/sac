#!/usr/bin/env node
// ./tests/runners/security_audit.cli.js
const { spawnSync } = require("node:child_process");

const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const minSeverity = process.env.SECURITY_AUDIT_MIN_SEVERITY || "moderate";
const allowlist = new Set(
  (process.env.SECURITY_AUDIT_ALLOWLIST || [
    "GHSA-92pp-h63x-v22m",
    "GHSA-458j-xx4x-4375",
    "GHSA-w5hq-g745-h8pq",
  ].join(","))
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
);
const packageAllowlist = new Set(
  (process.env.SECURITY_AUDIT_PACKAGE_ALLOWLIST || [
    "@azure/msal-node",
    "@hono/node-server",
    "@prisma/dev",
    "hono",
    "prisma",
    "uuid",
  ].join(","))
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
);

function advisoryId(item) {
  if (!item || typeof item !== "object") return null;
  if (item.url) {
    const match = String(item.url).match(/GHSA-[a-z0-9-]+/i);
    if (match) return match[0];
  }
  return item.source ? String(item.source) : null;
}

function audit() {
  return spawnSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

const result = audit();
const raw = result.stdout || result.stderr;

if (!raw) {
  console.error("npm audit produced no output.");
  process.exit(result.status || 1);
}

let report;
try {
  report = JSON.parse(raw);
} catch (err) {
  console.error(raw);
  console.error("Unable to parse npm audit JSON output.");
  process.exit(result.status || 1);
}

const minRank = SEVERITY_RANK[minSeverity] ?? SEVERITY_RANK.moderate;
const findings = [];

for (const vulnerability of Object.values(report.vulnerabilities || {})) {
  const severity = vulnerability.severity || "info";
  if ((SEVERITY_RANK[severity] ?? 0) < minRank) continue;

  const advisories = (vulnerability.via || [])
    .map(advisoryId)
    .filter(Boolean);
  const unallowed = advisories.filter(id => !allowlist.has(id));
  const viaPackages = (vulnerability.via || [])
    .filter(item => typeof item === "string");
  const hasOnlyAllowedPackages =
    viaPackages.length > 0 &&
    viaPackages.every(name => packageAllowlist.has(name)) &&
    packageAllowlist.has(vulnerability.name);

  if (unallowed.length > 0 || (advisories.length === 0 && !hasOnlyAllowedPackages)) {
    findings.push({
      name: vulnerability.name,
      severity,
      via: advisories.length ? advisories : vulnerability.via,
      fixAvailable: vulnerability.fixAvailable,
    });
  }
}

if (findings.length > 0) {
  console.error("npm audit found non-allowlisted vulnerabilities:");
  console.error(JSON.stringify(findings, null, 2));
  process.exit(1);
}

const allowedCount = Object.values(report.vulnerabilities || {}).length;
console.log(`npm audit passed. ${allowedCount} known advisories are currently allowlisted or below ${minSeverity}.`);
