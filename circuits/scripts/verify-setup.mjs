#!/usr/bin/env node
/**
 * Verify the DEVELOPMENT setup artifacts end to end. Read-only: writes nothing.
 *
 *   node scripts/verify-setup.mjs
 *
 * Checks, failing closed on the first problem:
 *   1. pinned snarkjs; recorded circom version; constraint count vs constraints.json
 *   2. SHA-256 of every artifact against artifact-hashes.json (and the R1CS / ptau recorded there)
 *   3. cryptographic verification of the final zkey against the R1CS and the prepared ptau
 *   4. the committed verification_key.json equals a fresh export from the zkey
 *   5. a proof round-trip on the deterministic synthetic vector from test-vectors/poseidon.json:
 *      public signals are exactly the four expected values in order, the proof verifies, and
 *      tampered public signals do not verify
 *
 * Offline; the proof and witness exist only in memory.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { verifyArtifacts, defaultArtifacts, loadManifest } from "./verify-artifacts.mjs";
import {
  PINNED,
  circuitsDir,
  fail,
  files,
  loadSnarkjs,
  readJson,
  repoRoot,
  sha256File,
} from "./setup-common.mjs";

const ok = (message) => console.log(`  ok  ${message}`);

const REQUIRED = [files.manifest, files.verificationKey, files.wasm, files.zkeyFinal, files.r1cs];
const absent = REQUIRED.filter((file) => !existsSync(file));
if (absent.length > 0) {
  console.error(
    `verify-setup: required artifacts are missing:\n  ${absent.join("\n  ")}\nRun \`npm run compile && npm run setup:dev\` in circuits/.`,
  );
  process.exit(30);
}

try {
  const { snarkjs, version } = await loadSnarkjs();
  ok(`snarkjs ${version} (pinned ${PINNED.snarkjs})`);

  const manifest = readJson(files.manifest);
  const meta = manifest.metadata;
  if (!meta || meta.devOnly !== true) fail("artifact-hashes.json has no DEV-only metadata block");
  if (meta.circomVersion !== `circom compiler ${PINNED.circom}`)
    fail(`recorded circom is "${meta.circomVersion}"`);
  if (meta.snarkjsVersion !== PINNED.snarkjs) fail(`recorded snarkjs is "${meta.snarkjsVersion}"`);
  ok(`${meta.circomVersion} recorded`);

  const guarded = readJson(files.constraints)[String(meta.levels)];
  if (guarded !== meta.nConstraints)
    fail(`constraints.json (${guarded}) != recorded ${meta.nConstraints}`);
  ok(`${meta.nConstraints} constraints match constraints.json at depth ${meta.levels}`);

  const artifactResult = verifyArtifacts({
    artifacts: defaultArtifacts(circuitsDir),
    manifest: loadManifest(circuitsDir),
  });
  if (!artifactResult.ok) fail(artifactResult.message);
  ok(
    "verification_key.json, membership.wasm, membership_DEV_final.zkey match artifact-hashes.json",
  );

  const ptauFinal = path.join(repoRoot, "circuits", meta.ptauFinalFile);
  if (!existsSync(ptauFinal)) fail(`${meta.ptauFinalFile} is missing`);
  const pairs = [
    [files.r1cs, meta.r1csSha256, "membership.r1cs"],
    [ptauFinal, meta.ptauFinalSha256, "final DEV ptau"],
    [files.circuit, meta.circuitSha256, "membership.circom"],
    [files.template, meta.templateSha256, "membership.template.circom"],
    [files.config, meta.configSha256, "config.json"],
  ];
  for (const [file, expected, label] of pairs) {
    if (sha256File(file) !== expected) fail(`${label} hash differs from artifact-hashes.json`);
  }
  ok("r1cs, ptau, circuit source, template and config hashes match");

  if ((await snarkjs.zKey.verifyFromR1cs(files.r1cs, ptauFinal, files.zkeyFinal)) !== true) {
    fail("zkey does not verify against the R1CS and ptau");
  }
  ok("zkey verifies against r1cs + ptau");

  const exported = await snarkjs.zKey.exportVerificationKey(files.zkeyFinal);
  const committed = readJson(files.verificationKey);
  if (JSON.stringify(exported) !== JSON.stringify(committed)) {
    fail("verification_key.json differs from a fresh export of the final zkey");
  }
  if (committed.nPublic !== 4 || committed.IC.length !== 5)
    fail("verification key must have 4 public signals / IC length 5");
  ok("verification_key.json equals the zkey's export (nPublic 4, IC 5)");

  // ---- proof round trip ---------------------------------------------------------------------
  const example = readJson(files.vectors).fullCircuitExample;
  const order = readJson(files.publicSignals).order;
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    example.input,
    files.wasm,
    files.zkeyFinal,
  );
  if (JSON.stringify(publicSignals) !== JSON.stringify(example.publicSignalsVector)) {
    fail("public signals differ from the expected vector (circuit and client Poseidon disagree?)");
  }
  for (const [i, name] of order.entries()) {
    if (publicSignals[i] !== example.expectedPublicSignals[name])
      fail(`public signal ${i} is not ${name}`);
  }
  ok(`public signals are [${order.join(", ")}] and equal the expected vector`);

  if ((await snarkjs.groth16.verify(committed, publicSignals, proof)) !== true)
    fail("valid proof did not verify");
  ok("proof verifies against verification_key.json");

  const tampered = [...publicSignals];
  tampered[2] = (BigInt(tampered[2]) + 1n).toString();
  if ((await snarkjs.groth16.verify(committed, tampered, proof)) !== false)
    fail("tampered signals verified");
  ok("proof with a tampered externalNullifier is rejected");

  console.log("\nverify-setup: all checks passed (DEVELOPMENT setup, not for production).");
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
