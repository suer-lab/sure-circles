import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MAX_CIRCLE_SIZE, TREE_LEVELS } from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));

test("TREE_LEVELS equals levels in circuits/config.json (the circuit's source of truth)", () => {
  const cfg = JSON.parse(
    readFileSync(join(here, "..", "..", "..", "circuits", "config.json"), "utf8"),
  );
  assert.equal(TREE_LEVELS, cfg.levels);
  assert.equal(MAX_CIRCLE_SIZE, 2 ** cfg.levels);
});
