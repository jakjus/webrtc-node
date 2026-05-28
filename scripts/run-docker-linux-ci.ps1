param(
  [string]$NodeImage = "node:20-bookworm",
  [string]$ArtifactsDir = "ci-artifacts/docker-linux-node20",
  [switch]$SkipWpt,
  [string[]]$WptSelector = @(),
  [int]$WptExpectedTotal = 0
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$artifactPath = Join-Path $root $ArtifactsDir
New-Item -ItemType Directory -Force $artifactPath | Out-Null

$rootForDocker = $root.Path -replace "\\", "/"
$artifactForDocker = (Resolve-Path $artifactPath).Path -replace "\\", "/"
$wptSelectorArgs = ($WptSelector | ForEach-Object {
  if ($_.Contains("'")) {
    throw "WPT selector cannot contain a single quote: $_"
  }
  "'$_'"
}) -join " "
$wptTestCommand = if ($WptSelector.Count -gt 0) {
  "npm run wpt:test -- $wptSelectorArgs"
} else {
  "npm run wpt:test"
}
$wptCheckCommand = if ($WptSelector.Count -gt 0) {
  $expectedTotal = if ($WptExpectedTotal -gt 0) { $WptExpectedTotal } else { $WptSelector.Count }
  "WPT_EXPECTED_TOTAL=$expectedTotal npm run wpt:check:strict"
} else {
  "npm run wpt:check:strict"
}
$wptReportCommand = if ($WptSelector.Count -gt 0) {
  "true"
} else {
  "npm run wpt:report -- --output /out/wpt-report.md && RUNNER_OS=Linux RUNNER_ARCH=X64 node scripts/write-ci-evidence.js --results /out/wpt-results.json --output /out/ci-evidence.json"
}
$wptCommand = if ($SkipWpt) {
  "npm run wpt:selection:check"
} else {
  "npm run wpt:selection:check && WPT_TEST_TIMEOUT_MS=180000 WPT_WORKER_TIMEOUT_MS=600000 WPT_WORKER_DELAY_MS=2000 WPT_CLEANUP_DELAY_MS=3000 $wptTestCommand 2>&1 | tee /out/wpt-output.txt && cp wpt-results.json /out/wpt-results.json && $wptCheckCommand && $wptReportCommand"
}

docker run --rm `
  -v "${rootForDocker}:/src:ro" `
  -v "${artifactForDocker}:/out" `
  $NodeImage `
  bash -lc "set -euo pipefail; mkdir -p /tmp/webrtc-node; tar -C /src --exclude='./build' --exclude='./node_modules' --exclude='./.git' --exclude='./wpt-results.json' --exclude='./wpt-report.md' --exclude='./ci-artifacts' -cf - . | tar -C /tmp/webrtc-node -xf -; cd /tmp/webrtc-node; if [ -f /etc/apt/sources.list.d/debian.sources ]; then sed -i '0,/URIs: http:\/\/deb.debian.org\/debian$/s//URIs: http:\/\/snapshot.debian.org\/archive\/debian\/20260421T000000Z/' /etc/apt/sources.list.d/debian.sources; sed -i '0,/URIs: http:\/\/deb.debian.org\/debian-security$/s//URIs: http:\/\/snapshot.debian.org\/archive\/debian-security\/20260421T000000Z/' /etc/apt/sources.list.d/debian.sources; fi; for attempt in 1 2 3; do if apt-get -o Acquire::Check-Valid-Until=false update >/out/apt-update.txt 2>&1 && apt-get install -y cmake ninja-build libssl-dev >/out/apt-install.txt 2>&1; then break; fi; if [ ""`$attempt"" = 3 ]; then exit 1; fi; sleep `$((attempt * 10)); done; npm ci 2>&1 | tee /out/npm-ci.txt; npm run check; npm run native:check; npm run build 2>&1 | tee /out/build-output.txt; npm test; npm run api:check; npm run types:check; npm run wpt:ensure; set +e; ${wptCommand}; wpt_status=`$?; set -e; cp wpt-results.json /out/wpt-results.json 2>/dev/null || true; cp wpt-manifest.json /out/wpt-manifest.json; npm run wpt:manifest > /out/wpt-manifest.txt; exit `$wpt_status"

$dockerExitCode = $LASTEXITCODE

if (-not $SkipWpt) {
  $resultsPath = Join-Path $artifactPath "wpt-results.json"
  if (-not (Test-Path $resultsPath)) {
    throw "Docker CI did not produce $resultsPath"
  }

  $results = Get-Content -Raw -Path $resultsPath | ConvertFrom-Json
  if ([int]$results.fail -gt 0) {
    throw "Docker CI WPT subset failed: $($results.pass)/$($results.total) passed"
  }
  $retried = @($results.results | Where-Object {
    ($_.PSObject.Properties.Name -contains "retries") -and [int]$_.retries -gt 0
  }).Count
  if ($retried -gt 0) {
    throw "Docker CI WPT subset required retries: $retried"
  }
}

if ($dockerExitCode -ne 0) {
  throw "Docker CI failed with exit code $dockerExitCode"
}
