<h1 align="center">webrtc-node</h1>

<p align="center">
  <a href="https://github.com/mertushka/webrtc-node/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/mertushka/webrtc-node/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@mertushka/webrtc-node"><img alt="npm" src="https://img.shields.io/npm/v/@mertushka/webrtc-node"></a>
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D20-339933">
  <img alt="API" src="https://img.shields.io/badge/API-W3C--style-0a7">
  <img alt="Data Channels" src="https://img.shields.io/badge/scope-data%20channels-4c1">
  <img alt="TypeScript" src="https://img.shields.io/badge/types-TypeScript-3178c6">
  <img alt="WPT" src="https://img.shields.io/badge/WPT-620%20selected%20subtests-4c1">
  <img alt="Native API" src="https://img.shields.io/badge/native-Node--API-blue">
  <img alt="License" src="https://img.shields.io/badge/license-MPL--2.0-orange">
</p>

<p align="center">
  WebRTC data channels for Node.js, backed by
  <a href="https://github.com/paullouisageneau/libdatachannel">libdatachannel</a>
  and validated with 620 selected Web Platform Tests subtests.
</p>

> [!NOTE]
> **Fork of [mertushka/webrtc-node](https://github.com/mertushka/webrtc-node) with asynchronous binary sends.**
>
> Upstream runs the full SCTP → DTLS-encrypt → `sendto()` stack synchronously inside
> `dataChannel.send()`, on the JS event-loop thread. Under game-server broadcast loads
> (e.g. a [HaxBall](https://www.haxball.com/) headless host relaying to a 30-player room at 60Hz)
> that steals milliseconds per tick from the event loop.
>
> This fork queues binary payloads to a dedicated native send thread (FIFO — per-channel
> ordering preserved; `rtc::DataChannel::send` is thread-safe), and adds
> **`WEBRTC_NODE_THREAD_POOL_SIZE`** to cap libdatachannel's worker pool, which upstream
> leaves at `hardware_concurrency()` per process. Combined effect on a 30-connection
> game-server workload: **~110% → 42% of one core** at identical throughput, with max
> event-loop lag down from 18ms to ~3ms. Full numbers in
> [Fork Benchmarks](#fork-benchmarks).
>
> Semantics notes: `send()` no longer surfaces synchronous transport errors (they are
> dropped, matching unreliable-channel behavior), and the queue is capped at 8192
> in-flight messages. Reliable bulk-transfer flows should monitor `bufferedAmount` /
> `bufferedamountlow` as usual, or use upstream instead.

```sh
npm install @mertushka/webrtc-node
```

## Usage

```js
const { RTCPeerConnection } = require("@mertushka/webrtc-node");

const pc = new RTCPeerConnection({ iceServers: [] });
const channel = pc.createDataChannel("events");

channel.addEventListener("open", () => {
  channel.send("hello from Node");
});

channel.addEventListener("message", (event) => {
  console.log(event.data);
});
```

See [examples/datachannel.js](examples/datachannel.js) for a complete local
offer/answer exchange.

## Supported Platforms

Node.js 20 or newer is required. The npm package downloads a matching Node-API
prebuild when available, verifies its SHA-256 digest and target, then falls back
to a `cmake-js` source build.

| OS | Prebuild targets | Node 20 | Node 22 | Node 24 |
| --- | --- | --- | --- | --- |
| Linux | x64 glibc, x64 musl | ✅ | ✅ | ✅ |
| macOS | x64, arm64 | ✅ | ✅ | ✅ |
| Windows | x64, arm64 | ✅ | ✅ | ✅ |

Source builds require CMake, a C++17 compiler, and OpenSSL development
libraries.

## Fork Benchmarks

All measurements from 2026-07-08 on Apple Silicon (10 cores), Node 22.5.1,
loopback UDP with real ICE/DTLS/SCTP. Workload shaped like a game-server host
(a HaxBall headless room): 30 peer connections, unreliable/unordered channels,
players send 24-byte inputs at 60Hz, host broadcasts 140-byte sync packets to
all peers at 60Hz — ~3,400 msgs/s through the host. Both ends run in one
process, so absolute CPU numbers overstate a real host roughly 2×; relative
differences are what matter.

### Backend comparison (why this binding at all)

Same workload on `node-datachannel` 0.31.0 (via its WebRTC polyfill) vs stock
`webrtc-node` 0.2.1:

| | `node-datachannel` 0.31.0 | `webrtc-node` 0.2.1 |
|---|---:|---:|
| Connect 30 peers | 29,558ms | **625ms (47×)** |
| CPU (30 players steady state) | 110.5% of a core | 108.1% |
| Throughput | 3,423 msg/s | 3,430 msg/s |
| Event-loop lag avg / max | 1.65 / 4.7ms | 1.70 / 4.5ms |

Steady-state cost is identical — the win is connection churn. The real
bottlenecks are below.

### Fix 1: async binary sends

Upstream `send()` runs SCTP → DTLS-encrypt → `sendto()` synchronously on the
JS thread. Cost of one 29-peer broadcast (29 × `send()`, 140 bytes, 60Hz):

| | upstream v0.2.1 | this fork |
|---|---:|---:|
| Per `send()` on JS thread | 47.8µs | **1.9µs (25×)** |
| Per broadcast tick avg | 1.386ms | **0.054ms** |
| Per broadcast tick p99 | 3.685ms | **0.123ms** |
| Per broadcast tick max | 8.708ms | **0.509ms** |
| Share of a 16.67ms tick budget | 8.3% | **0.3%** |
| Max event-loop lag (3 runs) | 7.8–18.1ms | **2.9–3.3ms** |
| Delivery | 100% of sent | 100% of sent |

Total process CPU is unchanged by this fix alone — the crypto/syscall work
moves to a spare core instead of blocking the event loop.

### Fix 2: thread-pool cap

libdatachannel spawns `hardware_concurrency()` workers per process. Sweeping
`WEBRTC_NODE_THREAD_POOL_SIZE` on the same 30-player workload (async sends
enabled; throughput and lag identical at every setting):

| Pool size | CPU (of one core) |
|---|---:|
| default (10 = cores) | 115% |
| 4 | 70% |
| **2** | **52%** |
| 1 | 51% |

Everything above ~2 workers is inter-worker contention overhead at this load.
Set 1–2 for room-sized processes; leave unset for high-fan-out
single-process servers.

### Combined

| | stock v0.2.1, default pool | fork, pool=2 |
|---|---:|---:|
| CPU @ 30 players | ~108–115% of a core | **42%** |
| Max event-loop lag | 8–18ms | **~3ms** |
| Throughput | 3,430 msg/s | 3,396 msg/s |

**≈2.6× less CPU per process** and a far more stable event loop.

## Performance Snapshot

Local benchmark snapshots show this package ahead on binary throughput and
object operation rates. Benchmarks are environment-sensitive; treat them as
directional rather than a substitute for testing your workload.

| Metric | `webrtc-node` | `node-datachannel` | `@roamhq/wrtc` |
| --- | ---: | ---: | ---: |
| Linux binary 8 KiB x1000 | 39.9 MB/s | 30.4 MB/s | 27.4 MB/s |
| Linux construct+close PC | 53k ops/s | 3.2k ops/s | 200 ops/s |
| Linux negotiated DC create+close | 2.2k ops/s | 974 ops/s | 173 ops/s |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Public
API changes should update runtime code, TypeScript declarations, tests, and WPT
documentation together.

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE).
