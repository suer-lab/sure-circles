#!/usr/bin/env node
/**
 * DEVELOPMENT / TEST trusted setup for the Sure Circles membership circuit.
 *
 *   node scripts/compile.mjs        # first
 *   node scripts/setup-dev.mjs [--power N] [--force]
 *
 * *** NOT FOR PRODUCTION. *** This runs the whole Groth16 setup on one machine: a fresh Powers of
 * Tau (Phase 1) with one local contribution, then a circuit-specific Phase 2 with one local
 * contribution. Whoever runs it could have kept the randomness ("toxic waste"), so it does not
 * give the trust assumptions of a multi-party ceremony. Use it for development and tests only.
 *
 * Offline: uses the installed snarkjs library (pinned), never the CLI, never a download. The
 * contribution entropy is generated fresh for each run from the OS CSPRNG, is never written to
 * disk, and is never logged.
 *
 * Outputs (all under circuits/, gitignored except the first two):
 *   verification_key.json, artifact-hashes.json, SETUP_TRANSCRIPT.md,
 *   build/membership_DEV_final.zkey, build/dev-setup/DEV_pot<N>_final.ptau
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import {
  PINNED,
  devSetupDir,
  fail,
  files,
  loadSnarkjs,
  makeLogger,
  minimumPower,
  ptauPaths,
  readJson,
  sha256File,
  stripTrailingWhitespace,
} from "./setup-common.mjs";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const powerFlag = argv.indexOf("--power");
const requestedPower = powerFlag === -1 ? null : Number(argv[powerFlag + 1]);

const freshEntropy = () => randomBytes(32).toString("hex");

try {
  const { snarkjs, version: snarkjsVersion } = await loadSnarkjs();

  if (!existsSync(files.compileInfo)) fail("run scripts/compile.mjs first (build/compile-info.json missing)");
  const compile = readJson(files.compileInfo);
  if (compile.circomVersion !== `circom compiler ${PINNED.circom}`) {
    fail(`build was produced by "${compile.circomVersion}", require circom ${PINNED.circom}`);
  }
  if (sha256File(files.r1cs) !== compile.r1csSha256) fail("membership.r1cs changed since compile; recompile");

  if (existsSync(files.zkeyFinal) && !force) {
    fail("a DEV setup already exists. Pass --force to replace it (this discards the old DEV keys).");
  }
  rmSync(devSetupDir, { recursive: true, force: true });
  rmSync(files.zkeyFinal, { force: true });
  rmSync(files.zkeyInitial, { force: true });
  mkdirSync(devSetupDir, { recursive: true });

  const logs = [];
  const logger = makeLogger(logs);
  const curve = await snarkjs.curves.getCurveFromName("bls12381");
  const r1csInfo = await snarkjs.r1cs.info(files.r1cs);
  const minPower = minimumPower(r1csInfo);
  await r1csInfo.curve.terminate();
  const power = requestedPower ?? minPower + 1;
  if (!Number.isInteger(power) || power < minPower || power > 20) {
    fail(`power ${power} is not usable: this circuit needs at least ${minPower} (max allowed here: 20)`);
  }

  const ptau = ptauPaths(power);
  const stages = [];
  const stage = (name, file) => stages.push({ name, file: file ? file.replace(/^.*[\\/]/, "") : null, sha256: file ? sha256File(file) : null });

  // ---- Phase 1: Powers of Tau (fresh, local) ------------------------------------------------
  console.log(`Phase 1: new accumulator, power ${power} (circuit needs >= ${minPower})`);
  await snarkjs.powersOfTau.newAccumulator(curve, power, ptau.initial, logger);
  stage("powersoftau new", ptau.initial);

  console.log("Phase 1: one local DEV contribution");
  await snarkjs.powersOfTau.contribute(
    ptau.initial,
    ptau.contributed,
    "Sure Circles DEV contribution 1 (NOT FOR PRODUCTION)",
    freshEntropy(),
    logger,
  );
  stage("powersoftau contribute", ptau.contributed);

  console.log("Phase 1: prepare phase 2");
  await snarkjs.powersOfTau.preparePhase2(ptau.contributed, ptau.final, logger);
  stage("powersoftau prepare phase2", ptau.final);

  console.log("Phase 1: verify");
  if ((await snarkjs.powersOfTau.verify(ptau.final, logger)) !== true) fail("Powers of Tau verification failed");

  // ---- Phase 2: Groth16 (circuit-specific) --------------------------------------------------
  console.log("Phase 2: groth16 setup");
  await snarkjs.zKey.newZKey(files.r1cs, ptau.final, files.zkeyInitial, logger);
  stage("zkey new (zero contributions)", files.zkeyInitial);

  console.log("Phase 2: one local DEV contribution");
  await snarkjs.zKey.contribute(
    files.zkeyInitial,
    files.zkeyFinal,
    "Sure Circles DEV zkey contribution 1 (NOT FOR PRODUCTION)",
    freshEntropy(),
    logger,
  );
  stage("zkey contribute (final DEV zkey)", files.zkeyFinal);

  console.log("Phase 2: verify final zkey against r1cs + ptau");
  if ((await snarkjs.zKey.verifyFromR1cs(files.r1cs, ptau.final, files.zkeyFinal, logger)) !== true) {
    fail("zkey verification failed");
  }

  const vkey = await snarkjs.zKey.exportVerificationKey(files.zkeyFinal, logger);
  writeFileSync(files.verificationKey, JSON.stringify(vkey, null, 2) + "\n");
  stage("verification key export", files.verificationKey);
  if (vkey.nPublic !== 4 || vkey.IC.length !== 5 || vkey.curve !== "bls12381" || vkey.protocol !== "groth16") {
    fail("exported verification key has an unexpected shape");
  }
  await curve.terminate();

  // The initial zero-contribution zkey and the intermediate ptau files are not kept.
  const zkeyInitialSha = sha256File(files.zkeyInitial);
  rmSync(files.zkeyInitial, { force: true });
  rmSync(ptau.initial, { force: true });
  rmSync(ptau.contributed, { force: true });

  // ---- Records --------------------------------------------------------------------------------
  const finalHashes = {
    "verification_key.json": sha256File(files.verificationKey),
    "membership.wasm": sha256File(files.wasm),
    "membership_DEV_final.zkey": sha256File(files.zkeyFinal),
  };
  const metadata = {
    devOnly: true,
    notice: "DEVELOPMENT / TEST SETUP. Single machine, single contributor. NOT FOR PRODUCTION.",
    circomVersion: compile.circomVersion,
    circomBinarySha256: compile.circomBinarySha256,
    snarkjsVersion,
    levels: compile.levels,
    nConstraints: compile.nConstraints,
    nWires: compile.nWires,
    nPublicInputs: compile.nPublicInputs,
    nPrivateInputs: compile.nPrivateInputs,
    nOutputs: compile.nOutputs,
    publicSignals: readJson(files.publicSignals).order,
    templateSha256: compile.templateSha256,
    configSha256: compile.configSha256,
    circuitSha256: compile.circuitSha256,
    r1csSha256: compile.r1csSha256,
    symSha256: compile.symSha256,
    ptauPower: power,
    ptauMinimumPower: minPower,
    ptauFinalFile: `build/dev-setup/DEV_pot${power}_final.ptau`,
    ptauFinalSha256: sha256File(ptau.final),
    zkeyInitialSha256: zkeyInitialSha,
  };
  writeFileSync(files.manifest, JSON.stringify({ ...finalHashes, metadata }, null, 2) + "\n");

  const contributionLines = logs
    .filter((l) => /hash|contribution|name|power/i.test(l.text))
    .map((l) => l.text.trim())
    .filter(Boolean);
  writeFileSync(
    files.setupLog,
    JSON.stringify({ generatedAt: new Date().toISOString(), power, stages, contributionLines }, null, 2) + "\n",
  );
  writeFileSync(
    files.devMarker,
    "DEVELOPMENT / TEST SETUP - NOT FOR PRODUCTION.\nEvery key in this directory and build/membership_DEV_final.zkey was produced on one machine by one\ncontributor. Do not deploy them to a network that holds real value.\n",
  );

  const transcript = renderTranscript({ metadata, finalHashes, stages, contributionLines, snarkjsVersion });
  writeFileSync(files.transcript, stripTrailingWhitespace(transcript));

  console.log("\nDEV setup complete (NOT FOR PRODUCTION).");
  for (const [name, hash] of Object.entries(finalHashes)) console.log(`  ${hash}  ${name}`);
  console.log(`  leftover files in dev-setup: ${readdirSync(devSetupDir).join(", ")}`);
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
}

function renderTranscript({ metadata, finalHashes, stages, contributionLines, snarkjsVersion }) {
  const stageRows = stages
    .map((s) => `| ${s.name} | ${s.file ?? ""} | ${s.sha256 ?? ""} |`)
    .join("\n");
  return `# DEVELOPMENT / TEST SETUP — NOT FOR PRODUCTION

This is a **single-machine development setup and does not provide the trust assumptions of a production
multi-party ceremony.** One person on one machine ran both Phase 1 and Phase 2 and could have retained the
contribution randomness. Do not use these keys for anything that holds real value. A production ceremony is a
separate, later task.

Contribution entropy is generated fresh from the operating system's CSPRNG for each run and is never stored or
printed, so it does not appear in this transcript.

## Environment

| | |
| --- | --- |
| Generated at | ${new Date().toISOString()} |
| Platform | ${os.type()} ${os.release()} (${process.platform} ${process.arch}) |
| Node.js | ${process.version} |
| npm | ${process.env.NPM_VERSION ?? "not recorded (set NPM_VERSION when running)"} |
| Circom | ${metadata.circomVersion} |
| Circom binary SHA-256 | \`${metadata.circomBinarySha256}\` |
| snarkjs (library, not CLI) | ${snarkjsVersion} |

## Circuit

| | |
| --- | --- |
| Template SHA-256 (\`membership.template.circom\`) | \`${metadata.templateSha256}\` |
| Config SHA-256 (\`config.json\`) | \`${metadata.configSha256}\` |
| Generated circuit SHA-256 (\`membership.circom\`) | \`${metadata.circuitSha256}\` |
| Merkle depth | ${metadata.levels} |
| Constraints | ${metadata.nConstraints} |
| Wires | ${metadata.nWires} |
| Public inputs / private inputs / outputs | ${metadata.nPublicInputs} / ${metadata.nPrivateInputs} / ${metadata.nOutputs} |
| Public signal order | ${metadata.publicSignals.join(", ")} |
| R1CS SHA-256 | \`${metadata.r1csSha256}\` |
| Sym SHA-256 | \`${metadata.symSha256}\` |
| Witness WASM SHA-256 | \`${finalHashes["membership.wasm"]}\` |

## Powers of Tau (Phase 1)

Power ${metadata.ptauPower} (2^${metadata.ptauPower} = ${2 ** metadata.ptauPower}). The circuit needs at least
power ${metadata.ptauMinimumPower}; one extra power was added as headroom. One local contribution, then
\`prepare phase2\`, then snarkjs verification of the prepared file (passed).

## Ceremony stages

| Stage | File | SHA-256 |
| --- | --- | --- |
${stageRows}

## Final DEV artifacts

| Artifact | SHA-256 |
| --- | --- |
| \`build/membership_DEV_final.zkey\` | \`${finalHashes["membership_DEV_final.zkey"]}\` |
| \`verification_key.json\` | \`${finalHashes["verification_key.json"]}\` |
| \`${metadata.ptauFinalFile}\` | \`${metadata.ptauFinalSha256}\` |

\`snarkjs zkey verify\` (library \`zKey.verifyFromR1cs\`) against the R1CS and the prepared Powers of Tau: **passed**.

## snarkjs contribution output (public hashes only)

\`\`\`
${contributionLines.join("\n")}
\`\`\`
`;
}
