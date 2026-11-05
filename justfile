# Sure Circles - local verification recipes
#
# Every recipe is a thin wrapper around a documented npm command. Nothing here touches the
# network, downloads anything, runs Git, or writes outside this workspace.
#
# Prerequisites: Node 22 (see .nvmrc) and `npm ci --ignore-scripts` already run.
#
#   just ci      the offline gate: typecheck, lint, format, dead code, unit tests
#   just verify  fast subset (typecheck + lint + format + unit tests)
#
# Deliberately NOT here yet (they need trusted-setup material, Rust/Stellar tooling, or a live
# network, and are added in later phases): circuit compile/setup, contract build and cargo
# tests, XDR golden generation, Testnet end-to-end and smoke runs, browser e2e.
#
# Run `just --list` to see the recipes. Requires just >= 1.33.0.
set working-directory := '.'

# -- Typecheck / lint / format ------------------------------------------------

typecheck:
    npm run typecheck --workspaces --if-present

lint:
    npm run lint

format-check:
    npm run format:check

# Unused files, exports and dependencies (knip).
lint-dead:
    npm run lint:dead

# -- Unit tests (offline) -------------------------------------------------------

test-core:
    npm test --workspace=packages/core

test-client:
    npm test --workspace=packages/client

test-app:
    npm test --workspace=app

# Node-test suites in scripts/. Hermetic: they must pass with networking disabled.
scripts-test:
    npm test --workspace=scripts

# Repo-structure hygiene: no duplicate recipe names, ci/verify present.
repo-structure-test:
    node --import tsx/esm --test scripts/justfile-recipes.test.ts

# -- Deterministic generated artifacts (local, no network, no trust material) -----

# Regenerate packages/{core,client}/api-surface.json from source.
api-surface:
    npm run gen:api-surface

# Fail if either api-surface.json is stale.
api-surface-check:
    npm run check:api-surface

# Regenerate test-vectors/{poseidon,public-signals,wire-format}.json.
vectors:
    npm run generate:all --workspace=test-vectors

# -- Repo checks ----------------------------------------------------------------

check-secrets:
    npm run check:secrets

check-adrs:
    npm run check:adrs

check-stellar-sdk:
    npm run check:stellar-sdk

# Remove build output (stays inside the workspace; see scripts/maintenance/clean.mjs).
clean:
    npm run clean

# Toolchain report. Read-only; does not install anything.
doctor *ARGS:
    npm run doctor --workspace=scripts -- {{ARGS}}

# -- Gates ------------------------------------------------------------------------

# The offline gate. Slow or networked work is intentionally outside it.
ci: typecheck lint format-check lint-dead api-surface-check scripts-test repo-structure-test test-core test-client test-app
    @echo "just ci: all offline gate checks passed."

# Fast pre-commit subset. Not the full gate: run `just ci` before opening a PR.
verify: format-check typecheck lint test-core test-client test-app
    @echo "just verify: fast subset passed. Run 'just ci' for the full offline gate."
