"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const failOnRetries =
  (args.includes("--fail-on-retries") || process.env.WPT_FAIL_ON_RETRIES === "1") &&
  !args.includes("--allow-retries") &&
  process.env.WPT_ALLOW_RETRIES !== "1";
const explicitPathIndex = args.indexOf("--results");
const resultsPath =
  explicitPathIndex === -1
    ? process.env.WPT_RESULTS || path.join(root, "wpt-results.json")
    : args[explicitPathIndex + 1];
const manifestPath = path.join(root, "wpt-manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};
const expectedTotal = process.env.WPT_EXPECTED_TOTAL
  ? Number(process.env.WPT_EXPECTED_TOTAL)
  : (manifest.expectedSelectedSubtests ?? null);

function fail(message) {
  console.error(`WPT result check failed: ${message}`);
  process.exit(1);
}

if (explicitPathIndex !== -1 && !resultsPath) {
  fail("--results requires a path");
}

if (!fs.existsSync(resultsPath)) {
  fail(`${resultsPath} does not exist`);
}

let summary;
try {
  summary = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
} catch (error) {
  fail(`could not parse ${resultsPath}: ${error.message}`);
}

if (!Array.isArray(summary.results)) {
  fail(`${resultsPath} is not a WPT run result artifact`);
}

if (!Number.isInteger(summary.total) || summary.total < 1) {
  fail("total must be a positive integer");
}

if (!Number.isInteger(summary.pass) || summary.pass < 0) {
  fail("pass must be a non-negative integer");
}

if (!Number.isInteger(summary.fail) || summary.fail < 0) {
  fail("fail must be a non-negative integer");
}

if (summary.results.length !== summary.total) {
  fail(`results length ${summary.results.length} does not match total ${summary.total}`);
}

const passCount = summary.results.filter((result) => result.status === "PASS").length;
const failCount = summary.results.filter((result) => result.status === "FAIL").length;
const unexpectedStatuses = summary.results.filter(
  (result) => result.status !== "PASS" && result.status !== "FAIL",
);
const retried = summary.results.filter((result) => Number(result.retries) > 0);

if (passCount !== summary.pass) {
  fail(`pass count ${summary.pass} does not match ${passCount} PASS results`);
}

if (failCount !== summary.fail) {
  fail(`fail count ${summary.fail} does not match ${failCount} FAIL results`);
}

if (unexpectedStatuses.length) {
  fail(`unexpected result status ${unexpectedStatuses[0].status}`);
}

if (summary.fail !== 0 || passCount !== summary.total) {
  const failures = summary.results
    .filter((result) => result.status !== "PASS")
    .slice(0, 5)
    .map((result) => `${result.file} :: ${result.name}`)
    .join("; ");
  fail(`selected WPT suite did not pass: ${failures}`);
}

if (expectedTotal !== null) {
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1) {
    fail("WPT_EXPECTED_TOTAL must be a positive integer");
  }
  if (summary.total !== expectedTotal) {
    fail(`total ${summary.total} does not match expected selected subtests ${expectedTotal}`);
  }
}

if (retried.length && failOnRetries) {
  const details = retried
    .slice(0, 5)
    .map((result) => `${result.file} :: ${result.name} (${result.retries})`)
    .join("; ");
  fail(`worker retries were recorded: ${details}`);
}

const retrySuffix = retried.length ? `, retries=${retried.length}` : ", retries=0";
console.log(`WPT results verified: ${summary.pass}/${summary.total} passed${retrySuffix}`);
