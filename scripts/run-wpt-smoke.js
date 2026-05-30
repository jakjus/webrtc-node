"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const selectors = [
  "webrtc/RTCPeerConnection-createOffer.html#createOffer() returns RTCSessionDescriptionInit",
  "webrtc/RTCDataChannel-send.html#Datachannel should be able to send simple string and receive as string",
  "webrtc/RTCDataChannel-close.html#Repeated open/send/echo/close datachannel works",
  "webrtc/RTCPeerConnection-iceGatheringState.html?interop-2026#connection with one data channel should eventually have connected connection state",
];

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "run-wpt-subset.js"), ...selectors],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.signal) {
  console.error(`WPT smoke terminated by ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
