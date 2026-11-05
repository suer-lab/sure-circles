# Continuous integration

CI lives in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It is **offline with respect to Stellar**: it
never contacts Testnet or Horizon, needs no secrets, deploys nothing and does not generate any trusted-setup
material. The only network use is fetching locked dependencies and the pinned Rust toolchain.

## Jobs

| Job | What it runs | Notes |
| --- | --- | --- |
| `typescript` | `tsc --noEmit` for `packages/core`, `packages/client`, `scripts`, `app`, `app/e2e` and the root project; client, app and scripts tests | 30 minute timeout |
| `core` | `packages/core` tests | The Poseidon/Merkle differential and property tests are deliberately slow (about five minutes). They keep their full iteration counts and per-test timeouts; the job gets a 40 minute timeout instead of the tests being weakened. |
| `contract` | `cargo fmt --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings` | Rust 1.94.1 from `rust-toolchain.toml`; builds for the host |
| `static` | `npm run check:secrets -- --all`, `npm run check:stellar-sdk` | Plain Node, no dependency install |

Versions are pinned in the workflow's `env` block (Node 22.20.0, npm 11.21.1, Rust 1.94.1) and must be kept in step
with `.nvmrc`, `rust-toolchain.toml` and [dependency-decisions.md](dependency-decisions.md). npm 11 is installed
explicitly because the npm 10 that ships with Node 22 cannot resolve this lockfile. Every install is locked
(`npm ci --ignore-scripts`, `cargo ... --locked`).

## Supply-chain review

Permissions are `contents: read` for the whole workflow. Triggers are `push` to `main` and `pull_request` only
(never `pull_request_target`). No secrets are referenced. There are no `curl`/`wget` downloads, no `sudo`, and no
pipe-to-shell.

External actions (both official, both pinned to an immutable commit SHA with the version in a comment):

| Action | Pinned to | Why |
| --- | --- | --- |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) | Check out the repository. Runs with `persist-credentials: false` so the token is not left on disk. |
| `actions/setup-node` | `949feb2413d6458794dcd2491c4babbbce0c15c1` (v7.1.0) | Install the pinned Node.js. |

Rust is installed with the runner's own `rustup` from the official distribution host, from the version pinned in
`rust-toolchain.toml`. No third-party Rust action is used. To update an action: look up the new release tag, resolve it
to its commit SHA, update the pin and the version comment together, and review the release notes.

## Deliberately not in CI yet

- **Contract WASM build.** It needs the Stellar CLI (28.1.0). Adding it would mean downloading a release binary in CI; do
  that only with a pinned URL and a verified SHA-256, as was done locally (see
  [ARTIFACT_PROVENANCE.md](ARTIFACT_PROVENANCE.md)).
- **Circuit tests** (`npm test --workspace=circuits`). They need a Circom 2.2.3 binary, with the same caveat.
- **Lint, format and ADR checks.** They fail today and are listed as pending cleanup in
  [publication-checklist.md](publication-checklist.md); they should join the gate once they pass.
- **Testnet end-to-end, smoke and browser tests.** They need a live network or a built app and are not part of the
  offline gate (see [deferred-features.md](deferred-features.md)).
- **Dependency and advisory audits** (`npm audit`, `cargo audit`, `cargo deny`).

## Caveat

The workflow has been reviewed and statically validated, and its commands were exercised on a clean checkout on
Windows, but it has not yet run on GitHub-hosted Linux runners. Expect to fix small platform differences the first time
it runs.
