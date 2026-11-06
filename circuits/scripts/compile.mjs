#!/usr/bin/env node
/**
 * Compile the Sure Circles membership circuit with the pinned circom version.
 *
 *   node scripts/compile.mjs
 *
 * Generates `membership.circom` from the template and config, then compiles it with
 * `--prime bls12381` (the only curve Soroban accelerates) into `circuits/build/`:
 * `membership.r1cs`, `membership.sym`, and `membership_js/` (witness-generation WASM).
 * Records what it did in `build/compile-info.json`. No trusted setup happens here.
 *
 * Set CIRCOM_BIN to a verified circom binary, or put it on PATH. Offline and read-only apart
 * from the build directory.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PINNED,
  buildDir,
  circuitsDir,
  fail,
  files,
  findCircom,
  loadSnarkjs,
  readJson,
  repoRoot,
  sha256File,
  stripAnsi,
} from "./setup-common.mjs";

try {
  const circom = findCircom();
  const { snarkjs, version: snarkjsVersion } = await loadSnarkjs();

  execFileSync(process.execPath, [files.genCircuit], { cwd: circuitsDir, stdio: "inherit" });

  mkdirSync(buildDir, { recursive: true });
  for (const stale of [files.r1cs, files.sym, path.join(buildDir, "membership_js")]) {
    rmSync(stale, { recursive: true, force: true });
  }

  const args = [
    "membership.circom",
    "--r1cs",
    "--wasm",
    "--sym",
    "--prime",
    "bls12381",
    "-l",
    path.join(repoRoot, "node_modules"),
    "-o",
    buildDir,
  ];
  const output = stripAnsi(execFileSync(circom.bin, args, { cwd: circuitsDir, encoding: "utf8" }));
  console.log(output.trim());

  const info = await snarkjs.r1cs.info(files.r1cs);
  const levels = readJson(files.config).levels;
  const record = {
    devOnly: "Build metadata only. Nothing here is trusted-setup material.",
    circomVersion: circom.version,
    circomBinarySha256: circom.sha256,
    snarkjsVersion,
    command: `circom membership.circom --r1cs --wasm --sym --prime bls12381 -l <repo>/node_modules -o build`,
    levels,
    nConstraints: Number(info.nConstraints),
    nWires: Number(info.nVars),
    nPublicInputs: Number(info.nPubInputs),
    nPrivateInputs: Number(info.nPrvInputs),
    nOutputs: Number(info.nOutputs),
    curve: info.curve.name,
    templateSha256: sha256File(files.template),
    configSha256: sha256File(files.config),
    circuitSha256: sha256File(files.circuit),
    r1csSha256: sha256File(files.r1cs),
    symSha256: sha256File(files.sym),
    wasmSha256: sha256File(files.wasm),
  };
  await info.curve.terminate();

  const committed = readJson(files.constraints)[String(levels)];
  if (committed !== record.nConstraints) {
    fail(
      `constraint count ${record.nConstraints} differs from circuits/constraints.json (${committed}) at depth ${levels}`,
    );
  }
  writeFileSync(files.compileInfo, JSON.stringify(record, null, 2) + "\n");
  console.log(
    `\ncompile OK: ${record.nConstraints} constraints, ${record.nWires} wires (circom ${PINNED.circom})`,
  );
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
