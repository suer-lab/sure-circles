# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it has releases.

## [Unreleased]

### Changed

- Project renamed from the upstream "Sharibo" to **Sure Circles**: package scope `@sure-circles/*`, Rust
  crate `sure_circles` (`contracts/circles`), environment variables `SURE_CIRCLES_*` / `VITE_SURE_CIRCLES_*`,
  browser storage keys and mock globals.
- All package manifests were rewritten: no install lifecycle hooks, exact version pins, one aligned
  `@stellar/stellar-sdk` version, internal packages pinned to exact workspace versions. See
  [docs/dependency-decisions.md](docs/dependency-decisions.md).
- Restored a single coherent app architecture based on the `useCircleFlow` hook; removed the unused lazy-screen
  code, `Shell.tsx` and the bundle-budget check from the build.
- `SureCirclesSDK` now has `getCircleCount()` and `getStatus(circleId)` (round, pot, target, cancelled); the SDK
  constructor and `connect` store and pass all fields.
- Tooling pins raised for security: `vite` 8.3.5, `vitest` and `@vitest/coverage-v8` 4.1.12.
- `.nvmrc` changed from `20` to `22`: the pinned Stellar SDK requires Node 22.12 or later.
- Text files normalised to LF line endings; `.gitattributes` added.
- Old repository and issue-tracker links were removed from source, tests and ADRs. UI links now come from
  `app/src/lib/links.ts` and point at the public repository, https://github.com/suer-lab/sure-circles.
- The runtime Google Fonts import was removed from `app/src/style.css` (privacy); fonts are to be
  self-hosted.

### Removed

- All generated cryptographic material, build outputs, test snapshots and deployment records inherited from the
  upstream project (everything of that kind in this repository was regenerated here), and its CI, hackathon and
  build-log documents.
- The docs test that depended on a deleted hackathon document.

### Added

- A local **development** trusted setup for the membership circuit (Circom 2.2.3, snarkjs 0.7.6, depth 4, 3,757
  constraints) with scripts to compile, set up and verify it (`circuits/scripts/{compile,setup-dev,verify-setup}.mjs`),
  a verification key, constraint counts and a setup transcript. It is single-machine and **not** a production ceremony.
- Deterministic generators and committed data: `api-surface.json` snapshots, `test-vectors/{poseidon,public-signals,
wire-format}.json`, and XDR goldens produced by the contract's own Rust test.
- Contract test fixtures generated from the development setup (`circuits/scripts/gen-contract-fixtures.mjs`); the
  inherited fixtures were removed.
- Typed client errors for contract error codes 11 (`InvalidRecipientError`) and 12 (`RoundNotExpiredError`).
- Offline GitHub Actions CI (`.github/workflows/ci.yml`; actions pinned to commit SHAs, no secrets, no network access to
  Stellar), described in [docs/ci.md](docs/ci.md), and [docs/publication-checklist.md](docs/publication-checklist.md).
- A reproducible build of the contract WASM with the Stellar CLI 28.1.0 (hash recorded in
  [docs/ARTIFACT_PROVENANCE.md](docs/ARTIFACT_PROVENANCE.md)), a new `justfile`, and
  [docs/artifact-policy.md](docs/artifact-policy.md).

### Fixed

- Setup transcript generator: trailing whitespace from raw snarkjs log lines is trimmed, so a regenerated transcript
  passes `git diff --check` (covered by a test; the committed transcript is unchanged).
- Test timeouts: the module-reset accessibility cases get a 30 s budget, because under full-suite load they exceeded
  the 5 s default; only those cases changed.
- Contract: repaired merge damage in `lib.rs` (duplicate constants and imports, undefined keys, a stale event publish,
  a duplicated `claim` check) in favor of the `storage.rs` / `events.rs` design.
- Circuit: removed a duplicate `externalNullifier` declaration that stopped the circuit compiling.
- Client: `verificationKeyToContractFormat` packed the two limbs of each G2 coordinate in the wrong order; an
  aborted artifact download returned truncated bytes as a success; XDR golden tests looked in the wrong directory and
  silently passed.
- Scripts: the smoke check for Horizon now uses the shared HTTP helper (and its deadline) instead of a raw `fetch`.
- App and tests: several test-isolation, accessibility-label and unhandled-rejection problems.

### Known gaps

See [docs/deferred-features.md](docs/deferred-features.md) for the maintained list. Highlights:

- No production trusted-setup ceremony and no independent audit; nothing is deployed.
- Testnet end-to-end, smoke and browser runs have not been performed.
- Admin-rotation and round-expiry client APIs (`proposeAdmin`, `acceptAdmin`, `expireRound`) are not available in
  the client, although the contract has the entrypoints.
- The contract does not limit claims to one per member per cycle (ADR 002 is not implemented).
- Six locales (`fr`, `hi`, `pt`, `tl`, `yo`, `zh`) are mostly untranslated English copies.
- Open `npm audit` findings remain in `snarkjs`-related and dev-tooling dependencies (0 critical, 0 high at last check).

### Security

- The only trusted setup is a single-machine development setup; no production ceremony exists. See [SECURITY.md](SECURITY.md).
