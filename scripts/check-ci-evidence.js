"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const artifactsIndex = args.indexOf("--artifacts");
const artifactsRoot =
  artifactsIndex === -1
    ? path.join(root, "ci-artifacts")
    : path.resolve(root, args[artifactsIndex + 1] || "");
const manifestPath = path.join(root, "wpt-manifest.json");
const requiredOs = ["Linux", "macOS", "Windows"];
const requiredNodeMajors = [20, 22, 24];

function fail(message) {
  console.error(`CI evidence check failed: ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`could not read ${file}: ${error.message}`);
  }
}

function walk(dir, matches = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, matches);
    else if (entry.isFile() && entry.name === "ci-evidence.json") matches.push(fullPath);
  }
  return matches;
}

function nodeMajor(version) {
  const match = /^v?(\d+)\./.exec(String(version || ""));
  return match ? Number(match[1]) : null;
}

if (artifactsIndex !== -1 && !args[artifactsIndex + 1]) fail("--artifacts requires a directory");
if (!fs.existsSync(artifactsRoot)) {
  fail(`${artifactsRoot} does not exist; download CI artifacts there or pass --artifacts <dir>`);
}
if (!fs.statSync(artifactsRoot).isDirectory()) fail(`${artifactsRoot} is not a directory`);
if (!fs.existsSync(manifestPath)) fail(`${manifestPath} does not exist`);

const manifest = readJson(manifestPath);
const evidenceFiles = walk(artifactsRoot);
if (!evidenceFiles.length) fail(`no ci-evidence.json files found under ${artifactsRoot}`);

const byMatrix = new Map();

for (const evidencePath of evidenceFiles) {
  const evidence = readJson(evidencePath);
  const dir = path.dirname(evidencePath);
  const os = evidence.runner?.os;
  const major = nodeMajor(evidence.node?.version);
  const key = `${os}|${major}`;

  if (!requiredOs.includes(os) || !requiredNodeMajors.includes(major)) continue;
  if (byMatrix.has(key)) fail(`duplicate evidence for ${os} Node ${major}`);

  const resultsPath = path.join(dir, "wpt-results.json");
  const reportPath = path.join(dir, "wpt-report.md");
  const artifactManifestPath = path.join(dir, "wpt-manifest.json");
  const manifestTextPath = path.join(dir, "wpt-manifest.txt");

  for (const requiredPath of [resultsPath, reportPath, artifactManifestPath, manifestTextPath]) {
    if (!fs.existsSync(requiredPath)) fail(`${path.relative(root, requiredPath)} is missing`);
  }

  const artifactManifest = readJson(artifactManifestPath);
  const results = readJson(resultsPath);
  const retries = Array.isArray(results.results)
    ? results.results.filter((result) => Number(result.retries) > 0).length
    : null;

  if (artifactManifest.libdatachannelCommit !== manifest.libdatachannelCommit) {
    fail(`${key} libdatachannel pin mismatch`);
  }
  if (artifactManifest.wptCommit !== manifest.wptCommit) fail(`${key} WPT pin mismatch`);
  if (artifactManifest.expectedSelectedSubtests !== manifest.expectedSelectedSubtests) {
    fail(`${key} selected subtest count mismatch`);
  }
  if (!Array.isArray(results.results)) fail(`${key} WPT result artifact is invalid`);
  if (results.results.length !== results.total) fail(`${key} result length mismatch`);
  if (results.total !== manifest.expectedSelectedSubtests) fail(`${key} WPT total mismatch`);
  if (results.pass !== results.total || results.fail !== 0 || retries !== 0) {
    fail(
      `${key} WPT is not strict-green: pass=${results.pass} total=${results.total} fail=${results.fail} retries=${retries}`,
    );
  }
  if (evidence.pins?.libdatachannel !== manifest.libdatachannelCommit) {
    fail(`${key} evidence libdatachannel pin mismatch`);
  }
  if (evidence.pins?.wpt !== manifest.wptCommit) fail(`${key} evidence WPT pin mismatch`);
  if (
    evidence.wpt?.total !== manifest.expectedSelectedSubtests ||
    evidence.wpt?.pass !== manifest.expectedSelectedSubtests ||
    evidence.wpt?.fail !== 0 ||
    evidence.wpt?.retries !== 0
  ) {
    fail(`${key} evidence WPT summary is not strict-green`);
  }

  byMatrix.set(key, { os, major, evidencePath });
}

const missing = [];
for (const os of requiredOs) {
  for (const major of requiredNodeMajors) {
    if (!byMatrix.has(`${os}|${major}`)) missing.push(`${os} Node ${major}`);
  }
}

if (missing.length) fail(`missing matrix evidence: ${missing.join(", ")}`);

console.log(
  `CI evidence verified: ${byMatrix.size}/${requiredOs.length * requiredNodeMajors.length} matrix jobs strict-green`,
);
