<h1 align="center">webrtc-node</h1>

<p align="center">
  <a href="https://github.com/jakjus/webrtc-node/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/jakjus/webrtc-node/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="fork version" src="https://img.shields.io/badge/fork-0.2.2--async.0-blue">
  <img alt="install" src="https://img.shields.io/badge/install-github%3Ajakjus%2Fwebrtc--node-lightgrey">
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
> **This is a fork of [mertushka/webrtc-node](https://github.com/mertushka/webrtc-node),
> tuned for hosts that serve many untrusted peers from one process** — the shape of a
> [HaxBall](https://www.haxball.com/) headless room. Five changes, all opt-in or
> behaviour-preserving when unconfigured:
>
> 1. **Async binary sends.** Upstream runs the whole SCTP → DTLS-encrypt → `sendto()`
>    stack synchronously inside `dataChannel.send()`, on the JS event-loop thread. This
>    fork queues binary payloads to a dedicated native send thread (FIFO, so per-channel
>    ordering is preserved; `rtc::DataChannel::send` is thread-safe). Per-send cost on the
>    JS thread drops **47.8µs → 1.9µs**.
> 2. **`WEBRTC_NODE_THREAD_POOL_SIZE`** caps libdatachannel's worker pool, which upstream
>    leaves at `hardware_concurrency()` *per process* — mostly inter-worker contention when
>    you run one process per room.
> 3. **Malformed-packet hardening.** A message listener that throws no longer unwinds the
>    flush loop or escapes as a fatal `uncaughtException`, and
>    **`WEBRTC_NODE_MAX_INBOUND_MESSAGE_SIZE`** drops oversized frames natively before the
>    V8 copy.
> 4. **`WEBRTC_NODE_PORT_RANGE`** / **`WEBRTC_NODE_BIND_ADDRESS`** pin ICE to a known UDP
>    window and to one address family, so a host firewall or a provider's DDoS filter has
>    something specific to target.
> 5. **OpenSSL is linked statically by default**, so the addon stops clobbering whatever
>    OpenSSL the host process already loaded.
>
> Combined effect on a 30-connection game-server workload: **~110% → 42% of one core** at
> identical throughput, with max event-loop lag down from 18ms to ~3ms. Full numbers in
> [Fork Benchmarks](#fork-benchmarks); knobs in [Fork Configuration](#fork-configuration).
>
> **Semantics to know before adopting:** `send()` no longer surfaces synchronous transport
> errors (they are dropped, matching unreliable-channel behaviour), and the queue is capped
> at 8192 in-flight messages. Reliable bulk-transfer flows should monitor `bufferedAmount` /
> `bufferedamountlow` as usual, or use upstream instead. A *sustained* flood of
> throwing packets still degrades delivery through the flush state machine — that is a DoS,
> not a crash, and it is shared with upstream.
>
> **In production:** 22 HaxBall rooms (ar.jakjus.com and jjrs.jakjus.com) have run on this
> fork since 2026-07-27.

## Install

This fork is **not published to npm** — `npm install @mertushka/webrtc-node` gets you
upstream. Install it from GitHub:

```sh
npm install github:jakjus/webrtc-node
```

The package name is deliberately left as `@mertushka/webrtc-node` so the fork is a true
drop-in. If you depend on it transitively (e.g. through `haxball.js`, which pulls
`@mertushka/webrtc-node` itself), add an override so *both* paths resolve to the fork:

```json
{
  "dependencies": {
    "@mertushka/webrtc-node": "github:jakjus/webrtc-node"
  },
  "overrides": {
    "@mertushka/webrtc-node": "github:jakjus/webrtc-node"
  }
}
```

There are no prebuilds for the fork, so installing compiles the native addon from source
(CMake, a C++17 compiler, and OpenSSL headers; a few minutes). The result is Node-API, so
the built addon stays valid across Node major versions.

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

## Fork Configuration

Every knob below is read **once per process, at addon load** — set them before requiring
the module. Leaving one unset preserves upstream behaviour exactly, so you can adopt them
one at a time.

| Env var | Default | Effect |
| --- | --- | --- |
| `WEBRTC_NODE_THREAD_POOL_SIZE` | `hardware_concurrency()` | libdatachannel worker threads for this process. Use `1`–`2` when you run one process per room; leave unset for a single high-fan-out server. |
| `WEBRTC_NODE_MAX_INBOUND_MESSAGE_SIZE` | `0` (no cap) | Bytes. Inbound frames larger than this are dropped natively, before the V8 copy. |
| `WEBRTC_NODE_PORT_RANGE` | unset (ephemeral) | `"begin-end"`, e.g. `"40000-40999"`. Constrains ICE to a fixed UDP window. Ignored when ICE UDP mux is active, since that pins its own single port. |
| `WEBRTC_NODE_BIND_ADDRESS` | unset (any, both families) | Local address for ICE gathering. Set `0.0.0.0` to restrict to IPv4 — otherwise IPv6 host candidates bind ephemeral ports *outside* `WEBRTC_NODE_PORT_RANGE` and escape your firewall window. |

Setting a port range without also setting `WEBRTC_NODE_BIND_ADDRESS=0.0.0.0` on a
dual-stack host is the one combination that quietly does not do what you want.

### Containing listener exceptions

A message listener that throws is reported out of band instead of escaping as a fatal
`uncaughtException`, and the offending message is dropped while delivery to other peers
continues. Subscribe to see them; without a subscriber they go to a throttled
`console.error`:

```js
process.on("webrtc-node:listenerError", (error) => {
  metrics.increment("webrtc.listener_error");
  console.error("listener threw:", error);
});
```

### Building

OpenSSL is linked statically by default (`WEBRTC_NODE_STATIC_OPENSSL=ON`) so the addon
does not clobber the OpenSSL already loaded by the host process. To link dynamically
against the system OpenSSL instead:

```sh
npx cmake-js rebuild --CDWEBRTC_NODE_STATIC_OPENSSL=OFF
```

## Supported Platforms

Node.js 20 or newer is required.

Upstream's npm package downloads a matching Node-API prebuild when available, verifies its
SHA-256 digest and target, then falls back to a `cmake-js` source build. **This fork
publishes no prebuilds**, so a GitHub install always takes the source-build path — the
platforms below are the ones it is expected to build on, not ones with a binary waiting.

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
