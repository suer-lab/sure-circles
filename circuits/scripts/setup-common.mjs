/**
 * Shared helpers for the circuit compile / DEVELOPMENT setup / verify scripts.
 *
 * Everything here is local: no downloads, no network, no Git. The tool versions are pinned and a
 * mismatch is a hard failure, so artifacts can never be produced by an unreviewed toolchain.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PINNED = Object.freeze({ circom: "2.2.3", snarkjs: "0.7.6" });

const defaultCircuitsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** `SURE_CIRCLES_CIRCUITS_DIR` points the scripts at another circuits layout (used by tests). */
export const circuitsDir = process.env.SURE_CIRCLES_CIRCUITS_DIR
  ? path.resolve(process.env.SURE_CIRCLES_CIRCUITS_DIR)
  : defaultCircuitsDir;
export const repoRoot = path.resolve(defaultCircuitsDir, "..");
export const buildDir = path.join(circuitsDir, "build");
export const devSetupDir = path.join(buildDir, "dev-setup");

export const files = Object.freeze({
  template: path.join(circuitsDir, "membership.template.circom"),
  config: path.join(circuitsDir, "config.json"),
  genCircuit: path.join(circuitsDir, "scripts", "gen-circuit.cjs"),
  circuit: path.join(circuitsDir, "membership.circom"),
  r1cs: path.join(buildDir, "membership.r1cs"),
  sym: path.join(buildDir, "membership.sym"),
  wasm: path.join(buildDir, "membership_js", "membership.wasm"),
  compileInfo: path.join(buildDir, "compile-info.json"),
  zkeyInitial: path.join(buildDir, "membership_DEV_0000.zkey"),
  zkeyFinal: path.join(buildDir, "membership_DEV_final.zkey"),
  verificationKey: path.join(circuitsDir, "verification_key.json"),
  manifest: path.join(circuitsDir, "artifact-hashes.json"),
  transcript: path.join(circuitsDir, "SETUP_TRANSCRIPT.md"),
  setupLog: path.join(devSetupDir, "setup-log.json"),
  devMarker: path.join(devSetupDir, "DEV-ONLY-NOT-FOR-PRODUCTION.txt"),
  vectors: path.join(repoRoot, "test-vectors", "poseidon.json"),
  publicSignals: path.join(repoRoot, "test-vectors", "public-signals.json"),
  constraints: path.join(circuitsDir, "constraints.json"),
});

export function ptauPaths(power) {
  const stem = `DEV_pot${power}`;
  return {
    initial: path.join(devSetupDir, `${stem}_0000.ptau`),
    contributed: path.join(devSetupDir, `${stem}_0001.ptau`),
    final: path.join(devSetupDir, `${stem}_final.ptau`),
  };
}

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

/** Resolve the circom binary: `CIRCOM_BIN`, else the first match on PATH. Version-checked. */
export function findCircom() {
  let bin = process.env.CIRCOM_BIN;
  if (!bin) {
    const names = process.platform === "win32" ? ["circom.exe", "circom"] : ["circom"];
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
      for (const name of names) {
        const candidate = path.join(dir, name);
        if (dir && existsSync(candidate) && statSync(candidate).isFile()) {
          bin = candidate;
          break;
        }
      }
      if (bin) break;
    }
  }
  if (!bin || !existsSync(bin)) {
    throw new Error(
      `circom ${PINNED.circom} not found. Set CIRCOM_BIN to a verified binary or put it on PATH.`,
    );
  }
  const version = stripAnsi(execFileSync(bin, ["--version"], { encoding: "utf8" })).trim();
  const expected = `circom compiler ${PINNED.circom}`;
  if (version !== expected) {
    throw new Error(`circom version mismatch: got "${version}", require "${expected}"`);
  }
  return { bin, version, sha256: sha256File(bin) };
}

/**
 * Remove trailing spaces and tabs from every line. snarkjs prints lines such as
 * "Next Challenge Hash: " with the value on the next line; the trailing space is cosmetic, but it makes
 * `git diff --check` fail on a committed transcript. Only whitespace at line ends is touched, so all
 * non-whitespace output and the line structure are unchanged.
 */
export function stripTrailingWhitespace(text) {
  return text.replace(/[ \t]+$/gm, "");
}

/** Load the installed snarkjs library (never the CLI, never a downloaded copy) and check its version. */
export async function loadSnarkjs() {
  const snarkjs = await import("snarkjs");
  let pkgPath = null;
  for (const base of [
    path.join(circuitsDir, "node_modules"),
    path.join(repoRoot, "node_modules"),
  ]) {
    const candidate = path.join(base, "snarkjs", "package.json");
    if (existsSync(candidate)) {
      pkgPath = candidate;
      break;
    }
  }
  if (!pkgPath) throw new Error("snarkjs is not installed (run `npm ci --ignore-scripts`)");
  const { version } = readJson(pkgPath);
  if (version !== PINNED.snarkjs) {
    throw new Error(`snarkjs version mismatch: got ${version}, require ${PINNED.snarkjs}`);
  }
  return { snarkjs, version };
}

/** snarkjs logger that keeps its (non-secret) output so hashes can be recorded. */
export function makeLogger(sink) {
  const push =
    (level) =>
    (...args) => {
      sink.push({ level, text: args.map(String).join(" ") });
    };
  return { debug: () => {}, info: push("info"), warn: push("warn"), error: push("error") };
}

export function bitLength(n) {
  return n.toString(2).length;
}

/** Smallest Powers of Tau exponent snarkjs accepts for this circuit (see snarkjs zkey_new.js). */
export function minimumPower(info) {
  return bitLength(Number(info.nConstraints) + Number(info.nPubInputs) + Number(info.nOutputs));
}

export function fail(message) {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}
