"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "wpt-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const expectedTotal = manifest.expectedSelectedSubtests;

function fail(message) {
  console.error(`WPT selection check failed: ${message}`);
  process.exit(1);
}

if (!Number.isInteger(expectedTotal) || expectedTotal < 1) {
  fail("wpt-manifest.json expectedSelectedSubtests must be a positive integer");
}

const resultsPath = path.join(
  os.tmpdir(),
  `webrtc-node-wpt-selection-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
);

try {
  const child = spawnSync(process.execPath, [path.join("scripts", "run-wpt-subset.js")], {
    cwd: root,
    env: {
      ...process.env,
      WPT_LIST_TESTS: "1",
      WPT_WORKER_RESULTS: resultsPath,
    },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: Number(process.env.WPT_SELECTION_TIMEOUT_MS || 300000),
  });

  if (child.error) fail(child.error.message);
  if (child.status !== 0 || child.signal) {
    const output = [child.stderr, child.stdout].filter(Boolean).join("\n").trim();
    fail(
      output ||
        (child.signal
          ? `list worker terminated by ${child.signal}`
          : `list worker exited with status ${child.status}`),
    );
  }
  if (!fs.existsSync(resultsPath)) {
    fail("list mode did not write a result artifact");
  }

  const payload = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  if (!Array.isArray(payload.tests)) {
    fail("list mode artifact does not contain a tests array");
  }
  if (!payload.tests.every((test) => typeof test === "string" && test.length > 0)) {
    fail("list mode artifact contains an invalid test name");
  }
  if (payload.tests.length !== expectedTotal) {
    fail(`selected ${payload.tests.length} subtests, expected ${expectedTotal}`);
  }

  console.log(`WPT selection verified: ${payload.tests.length} selected subtests`);
} finally {
  try {
    fs.unlinkSync(resultsPath);
  } catch {
    // Best-effort temp cleanup.
  }
}
