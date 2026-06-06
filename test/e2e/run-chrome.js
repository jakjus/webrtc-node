"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const testFile = path.join(__dirname, "chrome.test.js");
const groups = [
  {
    name: "core signaling and messages",
    pattern: "^(Node offerer|Chrome offerer|negotiated channels|Unicode)",
  },
  {
    name: "payloads, buffering, and channels",
    pattern: "^(Node enforces|Blob conversion|multiple channels)",
  },
  {
    name: "restart and close propagation",
    pattern: "^(ICE restart|Chrome closure)",
  },
  {
    name: "repeated connection stress",
    pattern: "^20 alternating offerer negotiations remain stable$",
  },
];

for (const group of groups) {
  console.log(`\nChrome E2E group: ${group.name}`);
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-force-exit",
      "--test-timeout=120000",
      `--test-name-pattern=${group.pattern}`,
      testFile,
    ],
    {
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
