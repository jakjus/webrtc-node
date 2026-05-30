"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const libc = require("detect-libc");
const tar = require("tar");

const root = path.resolve(__dirname, "..");
const packageJson = require("../package.json");
const moduleName = "webrtc_node.node";
const releaseBaseUrl = "https://github.com/mertushka/webrtc-node/releases/download";

function envFlag(name) {
  return /^(1|true|yes)$/i.test(String(process.env[name] || ""));
}

function isSourceCheckout() {
  return fs.existsSync(path.join(root, ".git")) && !root.split(path.sep).includes("node_modules");
}

function hasNativeAddon() {
  try {
    require("../lib/load-native");
    return true;
  } catch {
    return false;
  }
}

function linuxLibcTag() {
  if (process.platform !== "linux") return null;
  const family = libc.familySync();
  if (family === libc.MUSL) return "musl";
  if (family === libc.GLIBC) return "glibc";
  return null;
}

function targetTuple() {
  return [process.platform, process.arch, linuxLibcTag()].filter(Boolean).join("-");
}

function releaseTag() {
  return process.env.WEBRTC_NODE_PREBUILD_TAG || `v${packageJson.version}`;
}

function prebuildAssetName() {
  return `webrtc-node-${releaseTag()}-napi-v8-${targetTuple()}.tar.gz`;
}

function prebuildUrl() {
  return `${releaseBaseUrl}/${releaseTag()}/${prebuildAssetName()}`;
}

async function downloadPrebuild() {
  const response = await fetch(prebuildUrl(), {
    headers: { "user-agent": "webrtc-node-install" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const outputDir = path.join(root, "build", "Release");
  const archivePath = path.join(outputDir, prebuildAssetName());
  fs.mkdirSync(outputDir, { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(archivePath, buffer);
  await tar.x({ file: archivePath, cwd: outputDir });
  fs.unlinkSync(archivePath);
}

function runBuild() {
  const npm = process.env.npm_execpath
    ? process.execPath
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  const args = process.env.npm_execpath
    ? [process.env.npm_execpath, "run", "build"]
    : ["run", "build"];
  const result = spawnSync(npm, args, {
    cwd: root,
    stdio: "inherit",
  });
  return result.status === 0 && !result.signal;
}

async function main() {
  const buildFromSource = envFlag("npm_config_build_from_source");
  if (!buildFromSource && hasNativeAddon()) return;

  if (isSourceCheckout() && !buildFromSource) {
    console.log("Skipping native install in source checkout. Run npm run build explicitly.");
    return;
  }

  if (!buildFromSource) {
    try {
      await downloadPrebuild();
      if (hasNativeAddon()) return;
      throw new Error(`downloaded archive did not provide ${moduleName}`);
    } catch (error) {
      console.warn(`Prebuilt binary unavailable for ${targetTuple()}: ${error.message}`);
    }
  }

  if (!runBuild()) {
    console.error("No compatible prebuilt binary was found and the cmake-js source build failed.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
