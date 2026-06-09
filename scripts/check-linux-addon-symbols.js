"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const addonPath = path.resolve(
  process.argv[2] || path.join(root, "build", "Release", "webrtc_node.node"),
);

if (process.platform !== "linux") {
  console.log("Linux addon symbol check skipped on non-Linux platform.");
  process.exit(0);
}

const result = spawnSync("nm", ["-D", "--defined-only", addonPath], {
  encoding: "utf8",
});
if (result.status !== 0) {
  console.error(result.stderr || result.error?.message || "nm failed");
  process.exit(1);
}

const opensslPrefixes = [
  "AES_",
  "ASN1_",
  "BIO_",
  "BN_",
  "CRYPTO_",
  "DH_",
  "DSA_",
  "EC_",
  "ENGINE_",
  "ERR_",
  "EVP_",
  "HMAC_",
  "OPENSSL_",
  "OSSL_",
  "PEM_",
  "PKCS",
  "RAND_",
  "RSA_",
  "SHA",
  "SSL_",
  "TLS_",
  "X509_",
];

const exported = result.stdout
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/).at(-1))
  .filter(Boolean);
const leaked = exported.filter((symbol) =>
  opensslPrefixes.some((prefix) => symbol.startsWith(prefix)),
);

if (leaked.length > 0) {
  console.error(
    `Linux addon exports ${leaked.length} OpenSSL symbols, including: ${leaked
      .slice(0, 20)
      .join(", ")}`,
  );
  process.exit(1);
}

console.log(`Linux addon symbol isolation verified: ${exported.length} dynamic exports.`);
