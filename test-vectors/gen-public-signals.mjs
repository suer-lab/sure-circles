// Regenerates test-vectors/public-signals.json: the ordered public-signal manifest.
//
//   node test-vectors/gen-public-signals.mjs            # writes test-vectors/public-signals.json
//   node test-vectors/gen-public-signals.mjs --stdout   # prints instead of writing
//
// The order is read from circuit source, not typed in:
//   - outputs come from `signal output <name>` in circuits/membership.template.circom
//   - declared public inputs come from the `component main { public [...] }` line that
//     circuits/scripts/gen-circuit.cjs appends
// snarkjs emits outputs first, then declared public inputs in declaration order. Only text is
// read: no circom, no snarkjs, no network, no randomness.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const circuits = join(here, "..", "circuits");

const template = readFileSync(join(circuits, "membership.template.circom"), "utf8");
const genCircuit = readFileSync(join(circuits, "scripts", "gen-circuit.cjs"), "utf8");

// Restrict to the top-level SureCircles template so helper templates cannot contribute outputs.
const body = /template\s+SureCircles\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(template);
if (!body) throw new Error("template SureCircles not found in membership.template.circom");

const outputs = [...body[1].matchAll(/^\s*signal\s+output\s+([A-Za-z_]\w*)\s*;/gm)].map((m) => m[1]);
if (outputs.length === 0) throw new Error("SureCircles declares no output signals");

const mainLines = [
  ...genCircuit.matchAll(/component main \{ public \[([^\]]+)\] \} = SureCircles/g),
].map((m) => m[1].split(",").map((s) => s.trim()));
if (mainLines.length === 0) throw new Error("no `component main` line found in gen-circuit.cjs");
const [publicInputs] = mainLines;
for (const other of mainLines) {
  if (other.join() !== publicInputs.join()) {
    throw new Error("gen-circuit.cjs emits more than one distinct public-input list");
  }
}

const order = [...outputs, ...publicInputs];
const indices = Object.fromEntries(order.map((name, i) => [name, i]));

const manifest = {
  _comment:
    "Ordered Groth16 public signals for the Sure Circles membership circuit. Derived from circuits/membership.template.circom (outputs) and circuits/scripts/gen-circuit.cjs (declared public inputs); see docs/wire-format.md section 1.",
  order,
  indices,
  outputs,
  declaredPublicInputs: publicInputs,
  numberOfPublicSignals: order.length,
  requiredVkIcLength: order.length + 1,
};

const json = JSON.stringify(manifest, null, 2) + "\n";
if (process.argv.includes("--stdout")) {
  process.stdout.write(json);
} else {
  writeFileSync(join(here, "public-signals.json"), json);
}
