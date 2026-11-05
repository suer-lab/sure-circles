// Regenerates test-vectors/wire-format.json from scratch.
//
//   node test-vectors/gen-public-signals.mjs   # first: public-signals.json
//   node test-vectors/generate.mjs             # first: poseidon.json
//   node test-vectors/gen-wire-format.mjs      # writes test-vectors/wire-format.json
//   node test-vectors/gen-wire-format.mjs --stdout
//
// Inputs: public-signals.json and poseidon.json (both generated locally), plus Node's webcrypto.
// No verification key, no trusted-setup material, no network, no randomness, no external tools.
//
// The G1/G2 byte-layout examples use the standard BLS12-381 generator points, which are public
// curve constants and not trust material. The generator asserts that each point lies on its
// curve, so a mistyped coordinate fails here instead of producing a bad vector.
//
// This file encodes the encoding rules in docs/wire-format.md. If a test fails after a
// dependency bump, the implementations have diverged from the spec - do NOT edit the committed
// vectors to match; fix the divergence.

import { webcrypto } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const FR_MODULUS = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
const FQ_MODULUS =
  0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;

const publicSignals = JSON.parse(readFileSync(join(here, "public-signals.json"), "utf8"));
const poseidon = JSON.parse(readFileSync(join(here, "poseidon.json"), "utf8"));

if (poseidon.frModulus !== FR_MODULUS.toString()) {
  throw new Error("poseidon.json frModulus does not match the BLS12-381 scalar field");
}

// ── Helpers ──────────────────────────────────────────────────────────

function bytesToBigInt(bytes) {
  return BigInt("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
}

function bigIntToBytes(value, length) {
  const hex = value.toString(16).padStart(length * 2, "0");
  if (hex.length !== length * 2) throw new Error(`value does not fit in ${length} bytes`);
  return Buffer.from(hex, "hex");
}

const mod = (a) => ((a % FQ_MODULUS) + FQ_MODULUS) % FQ_MODULUS;

// Fq2 = Fq[u] / (u^2 + 1); elements are [c0, c1] meaning c0 + c1*u.
const fq2Mul = ([a0, a1], [b0, b1]) => [mod(a0 * b0 - a1 * b1), mod(a0 * b1 + a1 * b0)];
const fq2Add = ([a0, a1], [b0, b1]) => [mod(a0 + b0), mod(a1 + b1)];

function assertOnG1(x, y) {
  if (mod(y * y) !== mod(x * x * x + 4n)) throw new Error("G1 point is not on y^2 = x^3 + 4");
}

function assertOnG2(x, y) {
  const lhs = fq2Mul(y, y);
  const rhs = fq2Add(fq2Mul(fq2Mul(x, x), x), [4n, 4n]); // twist: b' = 4(1 + u)
  if (lhs[0] !== rhs[0] || lhs[1] !== rhs[1]) throw new Error("G2 point is not on the twist");
}

function g1Encode(x, y) {
  return Buffer.concat([bigIntToBytes(x, 48), bigIntToBytes(y, 48)]).toString("hex");
}

// Fq2 coordinates are serialised c1 first, then c0.
function g2Encode(x, y) {
  return Buffer.concat([
    bigIntToBytes(x[1], 48),
    bigIntToBytes(x[0], 48),
    bigIntToBytes(y[1], 48),
    bigIntToBytes(y[0], 48),
  ]).toString("hex");
}

// ── External nullifier known-answer tests ────────────────────────────

const externalNullifierPairs = [
  [0n, 0n],
  [1n, 0n],
  [0n, 1n],
  [1n, 1n],
  [42n, 7n],
  [0xffffffffffffffffn, 0xffffffffn],
];

const externalNullifierVectors = [];
for (const [circleId, round] of externalNullifierPairs) {
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setBigUint64(0, circleId, false);
  view.setUint32(8, Number(round), false);
  const digestBytes = new Uint8Array(await webcrypto.subtle.digest("SHA-256", buf));
  const digestInt = bytesToBigInt(digestBytes);

  const entry = {
    circleId: circleId.toString(),
    round: round.toString(),
    preimageHex: Buffer.from(buf).toString("hex"),
    sha256Hex: Buffer.from(digestBytes).toString("hex"),
    sha256Decimal: digestInt.toString(),
    result: (digestInt % FR_MODULUS).toString(),
  };
  if (digestInt >= FR_MODULUS) entry._note = "sha256Decimal >= r; result is the reduced value";
  externalNullifierVectors.push(entry);
}

// ── Standard BLS12-381 generators (public constants) ─────────────────

const g1 = {
  x: 0x17f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bbn,
  y: 0x08b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1n,
};
assertOnG1(g1.x, g1.y);

const g2 = {
  x: [
    0x024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8n,
    0x13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7en,
  ],
  y: [
    0x0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801n,
    0x0606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79ben,
  ],
};
assertOnG2(g2.x, g2.y);

// ── Public-signal vector from the cross-implementation Poseidon example ──

const example = poseidon.fullCircuitExample;
const signalVector = example.publicSignalsVector;
if (signalVector.length !== publicSignals.order.length) {
  throw new Error("poseidon.json publicSignalsVector length differs from public-signals.json");
}
for (const [i, name] of publicSignals.order.entries()) {
  if (example.expectedPublicSignals[name] !== signalVector[i]) {
    throw new Error(`publicSignalsVector[${i}] does not match expectedPublicSignals.${name}`);
  }
}

// ── Assemble the full vector file ────────────────────────────────────

const vectors = {
  _comment:
    "Cross-implementation wire-format test vectors. Validates the encoding rules in docs/wire-format.md. All implementations (circuit, contract, client) must agree with these fixtures. Regenerate via: node test-vectors/gen-wire-format.mjs",
  frModulus: FR_MODULUS.toString(),

  publicSignalOrder: {
    _comment:
      "snarkjs emits circuit outputs first, then declared public inputs in declaration order. Derived from public-signals.json: nullifierHash (output) is index 0, then root, externalNullifier and recipientHash.",
    order: publicSignals.order,
    indices: publicSignals.indices,
    contractVector: {
      _comment:
        "From fullCircuitExample in poseidon.json: the public_inputs vector the contract must build, in the order above.",
      circleId: example.circleId,
      round: example.round,
      publicInputs: signalVector,
    },
  },

  externalNullifier: {
    _comment:
      "SHA-256 over big-endian u64(circle_id) || u32(round), reduced mod r. Both Rust (lib.rs) and TypeScript (identity.ts) must agree on byte order and modulus reduction. See docs/wire-format.md section 2.",
    algorithm: "SHA-256( big_endian_u64(circle_id) || big_endian_u32(round) ) mod r",
    preimageBytes: 12,
    preimageLayout: "circle_id: bytes 0..7 (big-endian u64), round: bytes 8..11 (big-endian u32)",
    vectors: externalNullifierVectors,
  },

  g1Encoding: {
    _comment:
      "Uncompressed G1Affine: 48-byte big-endian X || 48-byte big-endian Y = 96 bytes total. No compression flag, no point-at-infinity sentinel. See docs/wire-format.md section 3.",
    format: "be_bytes(X) || be_bytes(Y)",
    byteLength: 96,
    examples: [
      {
        _comment: "Standard BLS12-381 G1 generator (public constant, verified on-curve).",
        label: "g1.generator",
        decimalCoordinates: { x: g1.x.toString(), y: g1.y.toString() },
        hex: g1Encode(g1.x, g1.y),
      },
    ],
  },

  g2Encoding: {
    _comment:
      "Uncompressed G2Affine: 48-byte be(X.c1) || 48-byte be(X.c0) || 48-byte be(Y.c1) || 48-byte be(Y.c0) = 192 bytes. Each Fq2 element has c1 first, c0 second. See docs/wire-format.md section 3.",
    format: "be_bytes(X.c1) || be_bytes(X.c0) || be_bytes(Y.c1) || be_bytes(Y.c0)",
    byteLength: 192,
    fq2Layout: "X = c0 + c1*u, encoded as [c1, c0] (c1 first)",
    examples: [
      {
        _comment: "Standard BLS12-381 G2 generator (public constant, verified on the twist).",
        label: "g2.generator",
        decimalCoordinates: {
          x: { c0: g2.x[0].toString(), c1: g2.x[1].toString() },
          y: { c0: g2.y[0].toString(), c1: g2.y[1].toString() },
        },
        hex: g2Encode(g2.x, g2.y),
      },
    ],
  },

  vkIcLengthRule: {
    _comment:
      "vk.ic.len() must equal number_of_public_signals + 1. verify_groth16 in lib.rs returns false when public_inputs.len() + 1 != vk.ic.len(). This rule needs no verification key; one is produced by the trusted setup, which is a separate step.",
    numberOfPublicSignals: publicSignals.numberOfPublicSignals,
    requiredIcLength: publicSignals.requiredVkIcLength,
    formula: "ic.len() == public_inputs.len() + 1",
  },
};

const json = JSON.stringify(vectors, null, 2) + "\n";
if (process.argv.includes("--stdout")) {
  process.stdout.write(json);
} else {
  writeFileSync(join(here, "wire-format.json"), json);
}
