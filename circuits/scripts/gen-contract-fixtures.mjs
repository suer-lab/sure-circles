#!/usr/bin/env node
/**
 * Generate the contract test fixtures from the DEVELOPMENT setup (Phase 8B).
 *
 *   node scripts/gen-contract-fixtures.mjs           # generate + verify + write
 *   node scripts/gen-contract-fixtures.mjs --check        # verify the committed fixtures only
 *   node scripts/gen-contract-fixtures.mjs --render-rust  # re-render the Rust module from the committed JSON
 *
 * *** DEVELOPMENT / TEST material, NOT FOR PRODUCTION. ***
 *
 * Inputs: the current build/membership_js/membership.wasm, build/membership_DEV_final.zkey and
 * verification_key.json, plus deterministic synthetic member data. Nothing is read from any
 * inherited workspace, and nothing here touches the network or Git.
 *
 * Outputs (single source of truth, then derived):
 *   contracts/circles/test-fixtures/dev-groth16-fixtures.json   canonical, machine-readable
 *   contracts/circles/src/test/dev_fixtures.rs                   generated from the JSON above
 *
 * Randomness: member data, tree, public signals and the verification key are fully deterministic.
 * A Groth16 proof also embeds fresh prover randomness that snarkjs does not let callers seed, so
 * the proof bytes differ on every generation. Generate once, commit, and use --check to confirm the
 * committed proofs still verify against the current verification key. No private witness value is
 * written to the fixtures.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { poseidon2 } from "poseidon-bls12381";
import {
  PINNED,
  fail,
  files,
  loadSnarkjs,
  readJson,
  repoRoot,
  sha256File,
} from "./setup-common.mjs";

const FR = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
const LEVELS = 4;
const MEMBER_COUNT = 3;
const MEMBER_INDEX = 1;
const CIRCLE_ID = 0n;

const fixtureDir = path.join(repoRoot, "contracts", "circles", "test-fixtures");
const jsonPath = path.join(fixtureDir, "dev-groth16-fixtures.json");
const rustPath = path.join(repoRoot, "contracts", "circles", "src", "test", "dev_fixtures.rs");

const checkOnly = process.argv.includes("--check");

const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest();
const bytesToBigInt = (bytes) => BigInt("0x" + Buffer.from(bytes).toString("hex"));
const fromLabel = (label) => bytesToBigInt(sha256Bytes(Buffer.from(label, "utf8"))) % FR;
const H = (a, b) => poseidon2([a, b]);

/** Same 40-byte ScVal address preimage the contract hashes (contract address, repeated byte k). */
function recipientPreimage(k) {
  const b = Buffer.alloc(40);
  b[3] = 18; // SCV_ADDRESS
  b[7] = 1; // SC_ADDRESS_TYPE_CONTRACT
  b.fill(k, 8);
  return b;
}
const recipientHash = (k) => bytesToBigInt(sha256Bytes(recipientPreimage(k))) % FR;

function externalNullifier(circleId, round) {
  const buf = Buffer.alloc(12);
  buf.writeBigUInt64BE(circleId, 0);
  buf.writeUInt32BE(round, 8);
  return bytesToBigInt(sha256Bytes(buf)) % FR;
}

function buildMembers() {
  const members = [];
  for (let i = 0; i < MEMBER_COUNT; i += 1) {
    const identityNullifier = fromLabel(`sure-circles/dev-fixture/member/${i}/nullifier`);
    const identitySecret = fromLabel(`sure-circles/dev-fixture/member/${i}/secret`);
    members.push({ identityNullifier, identitySecret, commitment: H(identityNullifier, identitySecret) });
  }
  return members;
}

function buildTree(leaves) {
  const layer0 = [...leaves];
  while (layer0.length < 2 ** LEVELS) layer0.push(0n);
  const layers = [layer0];
  for (let level = 0; level < LEVELS; level += 1) {
    const cur = layers[level];
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(H(cur[i], cur[i + 1]));
    layers.push(next);
  }
  return layers;
}

function merklePath(layers, leafIndex) {
  const pathElements = [];
  const pathIndices = [];
  let index = leafIndex;
  for (let level = 0; level < LEVELS; level += 1) {
    const isRight = index % 2 === 1;
    pathElements.push(layers[level][isRight ? index - 1 : index + 1]);
    pathIndices.push(isRight ? 1 : 0);
    index = Math.floor(index / 2);
  }
  return { pathElements, pathIndices };
}

const g1 = (p) => [p[0], p[1]];
const g2 = (p) => [
  [p[0][0], p[0][1]],
  [p[1][0], p[1][1]],
];

function vkFixture(vk) {
  return {
    alpha: g1(vk.vk_alpha_1),
    beta: g2(vk.vk_beta_2),
    gamma: g2(vk.vk_gamma_2),
    delta: g2(vk.vk_delta_2),
    ic: vk.IC.map(g1),
  };
}

function proofFixture(proof) {
  return { a: g1(proof.pi_a), b: g2(proof.pi_b), c: g1(proof.pi_c) };
}

const tamper = (signals, index) => {
  const copy = [...signals];
  copy[index] = (BigInt(copy[index]) + 1n).toString();
  return copy;
};

async function verifyScenario(snarkjs, vk, scenario, order) {
  const label = `round ${scenario.round}`;
  if (scenario.publicSignals.length !== 4) fail(`${label}: need exactly 4 public signals`);
  const proof = {
    pi_a: [...scenario.proof.a, "1"],
    pi_b: [...scenario.proof.b, ["1", "0"]],
    pi_c: [...scenario.proof.c, "1"],
    protocol: "groth16",
    curve: "bls12381",
  };
  if ((await snarkjs.groth16.verify(vk, scenario.publicSignals, proof)) !== true) {
    fail(`${label}: proof does not verify against verification_key.json`);
  }
  const byName = {
    nullifierHash: scenario.nullifierHash,
    root: scenario.root,
    externalNullifier: scenario.externalNullifier,
    recipientHash: scenario.recipientHash,
  };
  for (const [i, name] of order.entries()) {
    if (scenario.publicSignals[i] !== byName[name]) fail(`${label}: public signal ${i} is not ${name}`);
  }
  // Mutating the recipient binding or the round must break verification.
  for (const index of [2, 3]) {
    if ((await snarkjs.groth16.verify(vk, tamper(scenario.publicSignals, index), proof)) !== false) {
      fail(`${label}: tampered public signal ${index} still verified`);
    }
  }
}

function renderRust(doc, jsonSha) {
  const q = (s) => `"${s}"`;
  const g1c = (p) => `[${q(p[0])}, ${q(p[1])}]`;
  const g2c = (p) => `[${g1c(p[0])}, ${g1c(p[1])}]`;
  const proofC = (name, p) =>
    `pub const ${name}: ProofFixture = ProofFixture {\n    a: ${g1c(p.a)},\n    b: ${g2c(p.b)},\n    c: ${g1c(p.c)},\n};\n`;
  const [r0, r1] = doc.scenarios;
  return `// GENERATED FILE - DO NOT EDIT.
//
// DEVELOPMENT / TEST fixtures from the Sure Circles Phase 8B development setup. NOT FOR PRODUCTION.
// Source of truth: contracts/circles/test-fixtures/dev-groth16-fixtures.json
//   (SHA-256 ${jsonSha})
// Generator: circuits/scripts/gen-contract-fixtures.mjs (snarkjs ${doc.generator.snarkjs}).
// Verification key: circuits/verification_key.json (SHA-256 ${doc.source.verificationKeySha256}).
// No inherited ceremony material is used.

pub struct ProofFixture {
    pub a: [&'static str; 2],
    pub b: [[&'static str; 2]; 2],
    pub c: [&'static str; 2],
}

pub const VK_ALPHA: [&str; 2] = ${g1c(doc.verificationKey.alpha)};
pub const VK_BETA: [[&str; 2]; 2] = ${g2c(doc.verificationKey.beta)};
pub const VK_GAMMA: [[&str; 2]; 2] = ${g2c(doc.verificationKey.gamma)};
pub const VK_DELTA: [[&str; 2]; 2] = ${g2c(doc.verificationKey.delta)};
pub const VK_IC: [[&str; 2]; ${doc.verificationKey.ic.length}] = [
${doc.verificationKey.ic.map((p) => `    ${g1c(p)},`).join("\n")}
];

pub const ROOT: &str = ${q(doc.root)};

pub const NULLIFIER_HASH_ROUND0: &str = ${q(r0.nullifierHash)};
pub const NULLIFIER_HASH_ROUND1: &str = ${q(r1.nullifierHash)};
pub const EXTERNAL_NULLIFIER_ROUND0: &str = ${q(r0.externalNullifier)};
pub const EXTERNAL_NULLIFIER_ROUND1: &str = ${q(r1.externalNullifier)};
pub const RECIPIENT_HASH_ROUND0: &str = ${q(r0.recipientHash)};
pub const RECIPIENT_HASH_ROUND1: &str = ${q(r1.recipientHash)};

${proofC("PROOF_ROUND0", r0.proof)}
${proofC("PROOF_ROUND1", r1.proof)}`;
}

try {
  const { snarkjs, version } = await loadSnarkjs();
  if (version !== PINNED.snarkjs) fail(`snarkjs ${version} != ${PINNED.snarkjs}`);
  for (const f of [files.wasm, files.zkeyFinal, files.verificationKey, files.publicSignals]) {
    if (!existsSync(f)) fail(`missing ${f}; run the Phase 8B compile and setup first`);
  }
  const vk = readJson(files.verificationKey);
  if (vk.nPublic !== 4 || vk.IC.length !== 5) fail("verification key must have 4 public signals");
  const order = readJson(files.publicSignals).order;
  const vkSha = sha256File(files.verificationKey);

  if (process.argv.includes("--render-rust")) {
    // Re-derive the Rust module from the committed JSON without touching any proof.
    const doc = readJson(jsonPath);
    const jsonSha = createHash("sha256").update(readFileSync(jsonPath)).digest("hex");
    writeFileSync(rustPath, renderRust(doc, jsonSha));
    console.log(`rendered ${path.relative(repoRoot, rustPath)} from the committed JSON (sha256 ${jsonSha})`);
    process.exit(0);
  }

  if (checkOnly) {
    const doc = readJson(jsonPath);
    if (doc.source.verificationKeySha256 !== vkSha) fail("fixtures were made for a different verification key");
    if (JSON.stringify(doc.verificationKey) !== JSON.stringify(vkFixture(vk))) fail("fixture VK differs from verification_key.json");
    for (const scenario of doc.scenarios) await verifyScenario(snarkjs, vk, scenario, order);
    const jsonSha = createHash("sha256").update(readFileSync(jsonPath)).digest("hex");
    if (readFileSync(rustPath, "utf8") !== renderRust(doc, jsonSha)) fail("dev_fixtures.rs is stale versus the JSON");
    console.log(`fixtures OK: ${doc.scenarios.length} proofs verify against the DEV verification key; rust module matches.`);
    process.exit(0);
  }

  const members = buildMembers();
  const layers = buildTree(members.map((m) => m.commitment));
  const root = layers[LEVELS][0];
  const member = members[MEMBER_INDEX];
  const { pathElements, pathIndices } = merklePath(layers, MEMBER_INDEX);

  const scenarioSpecs = [
    { round: 0, recipientByte: 1 },
    { round: 1, recipientByte: 2 },
  ];
  const scenarios = [];
  for (const spec of scenarioSpecs) {
    const ext = externalNullifier(CIRCLE_ID, spec.round);
    const rh = recipientHash(spec.recipientByte);
    const input = {
      identityNullifier: member.identityNullifier.toString(),
      identitySecret: member.identitySecret.toString(),
      pathElements: pathElements.map(String),
      pathIndices,
      root: root.toString(),
      externalNullifier: ext.toString(),
      recipientHash: rh.toString(),
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, files.wasm, files.zkeyFinal);
    const expectedNullifier = H(member.identityNullifier, ext).toString();
    if (publicSignals[0] !== expectedNullifier) fail("circuit nullifierHash differs from poseidon2(identityNullifier, externalNullifier)");
    scenarios.push({
      name: `same member, circle ${CIRCLE_ID}, round ${spec.round}`,
      circleId: CIRCLE_ID.toString(),
      round: spec.round,
      recipientFixtureByte: spec.recipientByte,
      recipientPreimageHex: recipientPreimage(spec.recipientByte).toString("hex"),
      nullifierHash: publicSignals[0],
      root: publicSignals[1],
      externalNullifier: publicSignals[2],
      recipientHash: publicSignals[3],
      publicSignals,
      proof: proofFixture(proof),
    });
  }

  const doc = {
    notice: "DEVELOPMENT / TEST fixtures. Generated from the Phase 8B DEV setup. NOT FOR PRODUCTION. No private witness values are stored.",
    generator: { script: "circuits/scripts/gen-contract-fixtures.mjs", snarkjs: version, node: process.version },
    source: {
      verificationKeySha256: vkSha,
      zkeySha256: sha256File(files.zkeyFinal),
      witnessWasmSha256: sha256File(files.wasm),
      r1csSha256: sha256File(files.r1cs),
    },
    memberData: {
      derivation: "sha256('sure-circles/dev-fixture/member/<i>/{nullifier,secret}') mod r; leaf = poseidon2(nullifier, secret)",
      memberCount: MEMBER_COUNT,
      provenMemberIndex: MEMBER_INDEX,
      treeLevels: LEVELS,
    },
    publicSignalOrder: order,
    root: root.toString(),
    verificationKey: vkFixture(vk),
    scenarios,
  };
  for (const scenario of scenarios) await verifyScenario(snarkjs, vk, scenario, order);

  mkdirSync(fixtureDir, { recursive: true });
  const json = JSON.stringify(doc, null, 2) + "\n";
  writeFileSync(jsonPath, json);
  const jsonSha = createHash("sha256").update(json).digest("hex");
  writeFileSync(rustPath, renderRust(doc, jsonSha));
  console.log(`wrote ${path.relative(repoRoot, jsonPath)}  sha256 ${jsonSha}`);
  console.log(`wrote ${path.relative(repoRoot, rustPath)}`);
  console.log("both proofs verified; tampered externalNullifier / recipientHash rejected.");
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
