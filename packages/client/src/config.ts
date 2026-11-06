// Merkle tree depth used by this package. It must equal `levels` in circuits/config.json, which is the single
// source of truth for the circuit. A test (config.test.ts) enforces that, so no file is read at runtime: a runtime
// `require("fs")` only works in CommonJS and was silently falling back to the default under ESM.
// `process.env.LEVELS` can override it (Node only), mirroring circuits/scripts/gen-circuit.cjs.
const DEFAULT_TREE_LEVELS = 4;
const fromEnv =
  typeof process !== "undefined" && process.env && process.env.LEVELS
    ? Number(process.env.LEVELS)
    : undefined;
const _treeLevels =
  fromEnv !== undefined && Number.isInteger(fromEnv) ? fromEnv : DEFAULT_TREE_LEVELS;

export const TREE_LEVELS = _treeLevels;
export const MAX_CIRCLE_SIZE = 2 ** TREE_LEVELS;
