#!/usr/bin/env bash
set -euo pipefail

node_image="node:20-bookworm"
artifacts_dir="ci-artifacts/docker-linux-node20"
skip_wpt=0
wpt_expected_total=0
wpt_selectors=()

usage() {
  cat <<'EOF'
Usage: bash scripts/run-docker-linux-ci.sh [options]

Options:
  --node-image IMAGE          Node Docker image to use (default: node:20-bookworm)
  --artifacts-dir DIR         Output directory for logs/artifacts
  --skip-wpt                  Run build/unit/API/type/WPT-selection checks only
  --wpt-selector SELECTOR     Run one WPT file or file#subtest selector; repeatable
  --wpt-expected-total N      Expected selected subtest count for targeted WPT
  -h, --help                  Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --node-image)
      node_image="${2:?--node-image requires a value}"
      shift 2
      ;;
    --artifacts-dir)
      artifacts_dir="${2:?--artifacts-dir requires a value}"
      shift 2
      ;;
    --skip-wpt)
      skip_wpt=1
      shift
      ;;
    --wpt-selector)
      wpt_selectors+=("${2:?--wpt-selector requires a value}")
      shift 2
      ;;
    --wpt-expected-total)
      wpt_expected_total="${2:?--wpt-expected-total requires a value}"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd -- "$script_dir/.." && pwd)"
artifact_path="$root/$artifacts_dir"
mkdir -p "$artifact_path"

wpt_selector_args=""
for selector in "${wpt_selectors[@]}"; do
  if [[ "$selector" == *"'"* ]]; then
    echo "WPT selector cannot contain a single quote: $selector" >&2
    exit 2
  fi
  wpt_selector_args+=" '$selector'"
done

if [[ ${#wpt_selectors[@]} -gt 0 ]]; then
  wpt_test_command="npm run wpt:test --$wpt_selector_args"
  if [[ "$wpt_expected_total" -gt 0 ]]; then
    expected_total="$wpt_expected_total"
  else
    expected_total="${#wpt_selectors[@]}"
  fi
  wpt_check_command="WPT_EXPECTED_TOTAL=$expected_total npm run wpt:check:strict"
  wpt_report_command="true"
else
  wpt_test_command="npm run wpt:test"
  wpt_check_command="npm run wpt:check:strict"
  wpt_report_command="npm run wpt:report -- --output /out/wpt-report.md && RUNNER_OS=Linux RUNNER_ARCH=X64 node scripts/write-ci-evidence.js --results /out/wpt-results.json --output /out/ci-evidence.json"
fi

if [[ "$skip_wpt" -eq 1 ]]; then
  wpt_command="npm run wpt:selection:check"
else
  wpt_command="npm run wpt:selection:check && WPT_TEST_TIMEOUT_MS=180000 WPT_WORKER_TIMEOUT_MS=600000 WPT_WORKER_DELAY_MS=2000 WPT_CLEANUP_DELAY_MS=3000 $wpt_test_command 2>&1 | tee /out/wpt-output.txt && cp wpt-results.json /out/wpt-results.json && $wpt_check_command && $wpt_report_command"
fi

docker run --rm \
  -v "$root:/src:ro" \
  -v "$artifact_path:/out" \
  "$node_image" \
  bash -lc "set -euo pipefail; mkdir -p /tmp/webrtc-node; tar -C /src --exclude='./build' --exclude='./node_modules' --exclude='./.git' --exclude='./wpt-results.json' --exclude='./wpt-report.md' --exclude='./ci-artifacts' -cf - . | tar -C /tmp/webrtc-node -xf -; cd /tmp/webrtc-node; if [ -f /etc/apt/sources.list.d/debian.sources ]; then sed -i '0,/URIs: http:\/\/deb.debian.org\/debian$/s//URIs: http:\/\/snapshot.debian.org\/archive\/debian\/20260421T000000Z/' /etc/apt/sources.list.d/debian.sources; sed -i '0,/URIs: http:\/\/deb.debian.org\/debian-security$/s//URIs: http:\/\/snapshot.debian.org\/archive\/debian-security\/20260421T000000Z/' /etc/apt/sources.list.d/debian.sources; fi; for attempt in 1 2 3; do if apt-get -o Acquire::Check-Valid-Until=false update >/out/apt-update.txt 2>&1 && apt-get install -y cmake ninja-build libssl-dev >/out/apt-install.txt 2>&1; then break; fi; if [ \"\$attempt\" = 3 ]; then exit 1; fi; sleep \$((attempt * 10)); done; npm ci 2>&1 | tee /out/npm-ci.txt; npm run check; npm run native:check; npm run build 2>&1 | tee /out/build-output.txt; npm test; npm run api:check; npm run types:check; npm run wpt:ensure; set +e; $wpt_command; wpt_status=\$?; set -e; cp wpt-results.json /out/wpt-results.json 2>/dev/null || true; cp wpt-manifest.json /out/wpt-manifest.json; npm run wpt:manifest > /out/wpt-manifest.txt; exit \$wpt_status"
