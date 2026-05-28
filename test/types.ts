import {
  Event,
  EventTarget,
  MessageEvent,
  nonstandard,
  type RTCCertificate,
  type RTCDataChannelEvent,
  type RTCDtlsTransport,
  RTCError,
  RTCErrorEvent,
  RTCIceCandidate,
  type RTCIceCandidatePair,
  type RTCIceTransport,
  RTCPeerConnection,
  RTCPeerConnectionIceErrorEvent,
  type RTCSctpTransport,
  RTCSessionDescription,
} from "..";

const target = new EventTarget();
const event = new Event("custom", { cancelable: true });

target.addEventListener(
  "custom",
  (received) => {
    received.preventDefault();
  },
  { once: true },
);

target.addEventListener("custom", {
  handleEvent(received) {
    received.preventDefault();
  },
});

const dispatched: boolean = target.dispatchEvent(event);

const message = new MessageEvent<string>("message", { data: "hello" });
const payload: string = message.data;

const description = new RTCSessionDescription({ type: "offer", sdp: "v=0\r\n" });
const candidate = new RTCIceCandidate({
  candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host",
  sdpMid: "0",
  relayProtocol: "udp",
  url: "stun:stun.example.org",
});
const candidateComponent: "rtp" | "rtcp" | null = candidate.component;
const candidatePriority: number | null = candidate.priority;
const candidateRelayProtocol: string | null = candidate.relayProtocol;
const certificatePromise: Promise<RTCCertificate> = RTCPeerConnection.generateCertificate({
  name: "ECDSA",
  namedCurve: "P-256",
  expires: 60000,
});
const pc = new RTCPeerConnection();
pc.setConfiguration({ iceServers: [{ urls: "stun:stun.example.org" }], iceCandidatePoolSize: 0 });
const configuration = pc.getConfiguration();
const icePolicy: "all" | "relay" | undefined = configuration.iceTransportPolicy;
const iceError = new RTCPeerConnectionIceErrorEvent("icecandidateerror", {
  address: "192.0.2.1",
  port: 3478,
  url: "turn:turn.example.org",
  errorCode: 701,
  errorText: "server unreachable",
});
const iceErrorCode: number = iceError.errorCode;
const channel = pc.createDataChannel("typed");
const maybeSctp: RTCSctpTransport | null = pc.sctp;
const maybeDtls: RTCDtlsTransport | undefined = maybeSctp?.transport;
const maybeIce: RTCIceTransport | undefined = maybeDtls?.iceTransport;
const maybePair: RTCIceCandidatePair | null | undefined = maybeIce?.getSelectedCandidatePair();
const remoteCertificates: ArrayBuffer[] | undefined = maybeDtls?.getRemoteCertificates();

pc.ondatachannel = (received: RTCDataChannelEvent) => {
  received.channel.binaryType = "blob";
};

pc.onicecandidate = (received) => {
  const json = received.candidate?.toJSON();
  void json;
};

pc.onicecandidateerror = (received) => {
  const code: number = received.errorCode;
  void code;
};

channel.onmessage = (received) => {
  const data: unknown = received.data;
  void data;
};

channel.onerror = (received: RTCErrorEvent) => {
  const detail = received.error?.errorDetail;
  void detail;
};

const error = new RTCError({ errorDetail: "data-channel-failure" }, "failed");
const errorEvent = new RTCErrorEvent("error", { error });
const nativeSurface: unknown = nonstandard.native;

void dispatched;
void payload;
void description;
void candidate;
void candidateComponent;
void candidatePriority;
void candidateRelayProtocol;
void certificatePromise;
void icePolicy;
void iceErrorCode;
void maybeDtls;
void maybeIce;
void maybePair;
void remoteCertificates;
void errorEvent;
void nativeSurface;
pc.close();
