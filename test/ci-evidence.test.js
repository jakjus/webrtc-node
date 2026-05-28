const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "wpt-manifest.json"), "utf8"));
const requiredOs = ["Linux", "macOS", "Windows"];
const requiredNodeMajors = [20, 22, 24];

function makeResults() {
  const results = Array.from({ length: manifest.expectedSelectedSubtests }, (_, index) => ({
    file: "webrtc/fixture.html",
    name: `fixture ${index + 1}`,
    status: "PASS",
    retries: 0,
  }));
  return {
    total: results.length,
    pass: results.length,
    fail: 0,
    results,
  };
}

function makeEvidence(osName, nodeMajor, results) {
  return {
    runner: {
      os: osName,
      arch: "X64",
    },
    node: {
      version: `v${nodeMajor}.0.0`,
    },
    pins: {
      libdatachannel: manifest.libdatachannelCommit,
      wpt: manifest.wptCommit,
    },
    wpt: {
      total: results.total,
      pass: results.pass,
      fail: results.fail,
      retries: 0,
    },
  };
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeMatrixArtifact(artifactsRoot, osName, nodeMajor) {
  const results = makeResults();
  const artifactDir = path.join(artifactsRoot, `wpt-manifest-${osName}-node-${nodeMajor}`);
  fs.mkdirSync(artifactDir, { recursive: true });
  writeJson(path.join(artifactDir, "ci-evidence.json"), makeEvidence(osName, nodeMajor, results));
  writeJson(path.join(artifactDir, "wpt-results.json"), results);
  writeJson(path.join(artifactDir, "wpt-manifest.json"), manifest);
  fs.writeFileSync(path.join(artifactDir, "wpt-report.md"), "# WPT Conformance Report\n");
  fs.writeFileSync(path.join(artifactDir, "wpt-manifest.txt"), "fixture manifest\n");
}

function runEvidenceCheck(artifactsRoot) {
  return spawnSync(
    process.execPath,
    [path.join("scripts", "check-ci-evidence.js"), "--artifacts", artifactsRoot],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
}

function withTempArtifacts(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "webrtc-node-ci-evidence-"));
  try {
    return callback(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("CI evidence verifier accepts a complete strict-green matrix", () => {
  withTempArtifacts((artifactsRoot) => {
    for (const osName of requiredOs) {
      for (const nodeMajor of requiredNodeMajors) {
        writeMatrixArtifact(artifactsRoot, osName, nodeMajor);
      }
    }

    const result = runEvidenceCheck(artifactsRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /9\/9 matrix jobs strict-green/);
  });
});

test("CI evidence verifier rejects missing matrix jobs", () => {
  withTempArtifacts((artifactsRoot) => {
    for (const osName of requiredOs) {
      for (const nodeMajor of requiredNodeMajors) {
        if (osName === "Windows" && nodeMajor === 24) continue;
        writeMatrixArtifact(artifactsRoot, osName, nodeMajor);
      }
    }

    const result = runEvidenceCheck(artifactsRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing matrix evidence: Windows Node 24/);
  });
});
