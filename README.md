<h1 align="center">@mertushka/webrtc-node</h1>

<p align="center">
  W3C-style WebRTC data channels for Node.js, backed by
  <a href="https://github.com/paullouisageneau/libdatachannel">libdatachannel</a>
  and checked against selected web-platform-tests.
</p>

<p align="center">
  <a href="https://github.com/mertushka/webrtc-node/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/mertushka/webrtc-node/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="Native API" src="https://img.shields.io/badge/native-Node--API-blue">
  <img alt="License" src="https://img.shields.io/badge/license-MPL--2.0-orange">
</p>

> Experimental, data-channel-first milestone. This package does not claim full
> browser WebRTC compatibility.

## Overview

`@mertushka/webrtc-node` provides a browser-shaped WebRTC API for Node.js while
delegating ICE, DTLS, SCTP, and data-channel transport to `libdatachannel`.

The first milestone focuses on:

- `RTCPeerConnection`
- `RTCDataChannel`
- session descriptions and ICE candidates
- DOM-style events, promises, and WebRTC-shaped errors
- selected WPT conformance for data-channel behavior

Media tracks, transceivers, RTP sender/receiver APIs, stats, DTMF, and capture
devices are intentionally out of scope for now.

## Installation

The package is not published to npm yet. Build from source:

```sh
git clone https://github.com/mertushka/webrtc-node.git
cd webrtc-node
npm ci
npm run build
```

Requirements:

- Node.js 20 or newer
- CMake and a C++17 compiler
- OpenSSL development libraries

## Example

Run the bundled data-channel example after building:

```sh
node examples/datachannel.js
```

```js
const { RTCPeerConnection } = require("@mertushka/webrtc-node");

const pc = new RTCPeerConnection();
const channel = pc.createDataChannel("events");

channel.addEventListener("open", () => {
  channel.send("hello from Node");
});
```

See [examples/datachannel.js](examples/datachannel.js) for a complete local
offer/answer exchange.

## Project Status

| Area | Status |
| --- | --- |
| Native binding | Node-API/node-addon-api, no direct V8 or NAN APIs |
| Transport backend | pinned `libdatachannel` via CMake `FetchContent` or local checkout |
| Public API | W3C-style JavaScript facade with TypeScript declarations |
| Conformance target | selected WPT subset tracked in `wpt-manifest.json` |
| Current scope | data channels and basic peer-connection signaling |

Intentional WebRTC divergences are documented in
[docs/divergences.md](docs/divergences.md).

## Development

Common local checks:

```sh
npm run check
npm run native:check
npm run build
npm test
npm run api:check
npm run types:check
npm run pack:check
npm run wpt:selection:check
```

Run selected WPT tests:

```sh
npm run wpt:ensure
npm run wpt:test
npm run wpt:check:strict
```

Use `npm run format` to apply Biome formatting before opening a pull request.

More details:

- [docs/development.md](docs/development.md)
- [docs/conformance.md](docs/conformance.md)
- [docs/architecture.md](docs/architecture.md)

## Repository Layout

```text
lib/                 JavaScript WebRTC facade
src/native/          Node-API addon
examples/            runnable examples
test/                focused node:test coverage
scripts/             build, API, WPT, and CI utilities
docs/                architecture, conformance, and design notes
wpt-manifest.json    selected WPT scope
index.d.ts           TypeScript declarations
```

Local `build/`, `node_modules/`, `libdatachannel/`, `wpt/`, and
`ci-artifacts/` directories are ignored development caches.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Public
API changes should update runtime code, TypeScript declarations, tests, and WPT
documentation together.

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE).
