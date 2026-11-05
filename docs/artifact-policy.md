# Generated-artifact policy

Which generated files are committed to the repository, which are ignored, and why. Hashes and generation details
for each file are in [ARTIFACT_PROVENANCE.md](ARTIFACT_PROVENANCE.md).

The guiding rule: **commit small, reviewable, deterministic or public-by-nature data; do not commit large binaries,
transient files or anything that is regenerated per machine.** Source of truth is the source code and the
generators, not the generated output.

## Decisions

| Artifact | Decision | Why |
| --- | --- | --- |
| `packages/core/api-surface.json`, `packages/client/api-surface.json` | **Commit** | Deterministic; tests compare the public API against them, so a diff is a reviewable API change. |
| `test-vectors/poseidon.json`, `public-signals.json`, `wire-format.json` | **Commit** | Deterministic cross-implementation vectors that several test suites read. |
| `test-vectors/xdr/*.b64` (and the copy under `contracts/circles/test_snapshots/xdr_goldens/`) | **Commit** | Golden files for the XDR tests. Tiny. They embed the DEV verification key, so they change when the setup is rerun. |
| `contracts/circles/test-fixtures/dev-groth16-fixtures.json` and `src/test/dev_fixtures.rs` | **Commit** | The Rust tests need them. Proof bytes are not reproducible, so regenerating changes them. |
| `circuits/verification_key.json` | **Commit** | Public by nature (a verification key is not secret). The contract tests, goldens and fixtures are tied to it. It is a **DEV** key. |
| `circuits/constraints.json` | **Commit** | Small; a guard that catches accidental circuit changes. |
| `circuits/artifact-hashes.json`, `circuits/SETUP_TRANSCRIPT.md` | **Commit** | Records of the DEV setup. They contain hashes and public ceremony output only, never contribution entropy. |
| `docs/deterministic-artifacts.sha256`, `dev-setup-artifacts.sha256`, `phase8c-artifacts.sha256` | **Commit** | Machine-readable manifests; let anyone check that their regenerated files match. |
| `circuits/membership.circom` | **Ignore** (already) | Regenerated from the template and `config.json` by `gen-circuit.cjs` on every compile. |
| `circuits/build/membership.r1cs`, `membership.sym`, `membership_js/` | **Ignore / regenerate** | Build output of `npm run compile`. Reproducible with the pinned Circom. |
| `circuits/build/membership_DEV_final.zkey` | **Ignore** (`*.zkey`) | Binary, tied to the key above. Treat it as a release artifact (see below). |
| `circuits/build/dev-setup/*.ptau` | **Ignore** (`*.ptau`) | 14 MB binary. Needed only to re-verify the zkey. |
| Witness files, proof/public JSON from proving | **Ignore** (`*.wtns`) | Transient. Never persisted by the scripts. |
| `contracts/target/`, the contract WASM | **Ignore** (`target/`) | Build output. The WASM is a **release artifact**: attach it to a release with its SHA-256 and the toolchain versions. Nothing in the repository needs the binary. |
| `contracts/circles/test_snapshots/test/` | **Ignore** | Rewritten on every `cargo test`. Only `xdr_goldens/` is committed. |
| `app/public/circuits/` | **Ignore** | Populated by `npm run sync-circuit` from the build output. |
| local tooling and migration material | **Outside the repository** | Kept in a separate directory next to the working tree, never inside it; `.gitignore` also lists `/_tools/` and `/_reference/` as defense in depth. |

## Consequence: a fresh clone cannot reproduce the committed DEV key

The development setup uses fresh randomness, so running `npm run setup:dev` on a clean clone produces a
**different** verification key. The committed verification key, goldens, fixtures and hashes describe one specific
development setup whose proving key (`membership_DEV_final.zkey`, about 2.3 MB) is deliberately not in Git.

Practical effect:

- Everything that only needs the **committed** files works from a clone: the TypeScript unit tests, the Rust tests
  (their proofs and key are committed) and the XDR golden tests.
- `gen-contract-fixtures.mjs --check` and `verify-setup` need the build output (witness WASM, zkey, ptau) to exist, so
  they do not run from a bare clone.
- Anything that needs to **prove** (the browser app, `verify-setup`, regenerating fixtures) needs either the matching
  DEV zkey (publish it, with the witness WASM, R1CS and ptau, as a release artifact next to its hashes) or a fresh
  setup followed by regenerating every derived file.

When a production ceremony replaces the DEV setup, the verification key, fixtures, goldens and manifests are all
regenerated and re-committed, and the proving key is distributed through the ceremony's own channel.
