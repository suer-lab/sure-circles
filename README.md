# Sure Circles

Privacy-preserving savings circles on Stellar, using Soroban smart contracts and zero-knowledge proofs.

> **Status: early development. Testnet only. Not audited. Not production-ready. Not deployed anywhere.**
> The trusted setup in this repository is a **development setup produced on one machine** and gives none of the
> security of a real multi-party ceremony. Do not use this code with real funds.

## What it is

A savings circle (also called a rotating savings and credit association, or ROSCA: _ajo_, _esusu_,
_tanda_, _susu_, _tontine_ and many other names) is a fixed group whose members each contribute the same
amount every round, with one member taking the whole pot each round until everyone has had a turn.

Sure Circles runs that on Stellar. The member who claims the pot proves in zero knowledge that they are a
member of the circle, without revealing **which** member. An on-chain observer sees the contributions and
one payout, and cannot link the payout to a member.

## How it works

```
create_circle(admin, token, root, contribution, size, ..., vk, ...) -> circle_id
        |  root = Merkle root of Poseidon(identityNullifier, identitySecret) leaves,
        |  computed off-chain by the client for every member
        v
fund(circle_id, from)  x size
        |  from.require_auth(); pot += contribution
        v
claim(circle_id, recipient, nullifier_hash, external_nullifier, proof)
        |  1. the pot is fully funded
        |  2. external_nullifier matches the circle id and the current round
        |  3. nullifier_hash has not been used for this circle
        |  4. the Groth16 / BLS12-381 pairing check passes (recipient is a public input)
        |  -> record the nullifier, pay the pot to `recipient`, reset the pot, advance the round
```

The claimant proves, in zero knowledge, that `Poseidon(identityNullifier, identitySecret)` is a leaf under the
circle's committed Merkle root, and the proof is bound to a nullifier for `(circle_id, round)` (so a replay
fails) and to the payout `recipient` (so a proof cannot be redirected). The pot can be paid to any address the
claimant chooses.

Design invariants that hold across the circuit, the contract and the client:

- **BLS12-381 throughout.** Soroban accelerates BLS12-381 pairings natively, so the circuit, the setup, the
  Poseidon parameters, the contract verifier and the client encoding all use that curve.
- **Commitment:** `leaf = Poseidon(identityNullifier, identitySecret)`.
- **Nullifier:** `nullifierHash = Poseidon(identityNullifier, externalNullifier)`.
- **Round tag:** `externalNullifier` is derived from `(circle_id, round)` outside the circuit (SHA-256, reduced mod r).
- **Public signal order:** `[nullifierHash, root, externalNullifier, recipientHash]`.

The byte-level encodings are specified in [docs/wire-format.md](docs/wire-format.md). Architecture and design
decisions are in [docs/architecture.md](docs/architecture.md) and [docs/adr/](docs/adr/).

## Current status

What exists and is verified locally:

- A Soroban contract (`contracts/circles`, crate `sure_circles`) with unit and property tests, built reproducibly
  with the Stellar CLI.
- A membership circuit (Circom, depth 4, 3,757 constraints), a local DEVELOPMENT Groth16 setup and a verified
  proof round trip.
- A TypeScript SDK (`packages/core`, `packages/client`) and a React demo app (`app/`), each with unit tests.
- Deterministic cross-implementation test vectors, XDR goldens and an API-surface snapshot.

What has **not** been done:

- No deployment to any network, and no end-to-end, smoke or browser run against Testnet.
- No production trusted-setup ceremony, and no independent security audit.
- The production build of the browser app has not been run.

See [docs/deferred-features.md](docs/deferred-features.md) for the full list of intentionally missing pieces.

## Known limitations

- **Development trusted setup only.** The verification key, proving key and every artifact derived from them
  (test fixtures, XDR goldens, test proofs) come from a single-machine development setup. A multi-party ceremony
  is required before any real value is involved. See [circuits/SETUP_TRANSCRIPT.md](circuits/SETUP_TRANSCRIPT.md).
- **Claim-side privacy only.** Funding is public. Hiding who funded a circle is not implemented.
- **No per-cycle claim limit yet.** The contract does not enforce "one claim per member per cycle": the same
  identity can claim in consecutive rounds. ADR 002 proposes a fix and is not implemented.
- **Third-party Poseidon constants.** The Poseidon-over-BLS12-381 parameters come from a third-party package and
  have not been independently audited.
- **Not audited.** The material in [docs/audit/](docs/audit/README.md) is an audit-preparation scope, not an audit.
- **Testnet and a test token only.**

## Requirements

Versions are pinned in the repository; the reasons are in [docs/dependency-decisions.md](docs/dependency-decisions.md).

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | 22.x (`.nvmrc`; 22.20.0 was used) | everything in TypeScript |
| npm | 11.x (11.21.1 was used) | npm 10 cannot resolve this lockfile |
| Rust | 1.94.1, from `rust-toolchain.toml`, with `rustfmt`, `clippy` and `wasm32v1-none` | the contract |
| Stellar CLI | 28.1.0 | building the contract WASM (soroban-sdk 28 requires it) |
| Circom | 2.2.3 | compiling the circuit |
| snarkjs | 0.7.6 | installed from npm (the library; its CLI is not used) |

## Getting started

```bash
npm ci --ignore-scripts        # install exactly what the lockfile says; no lifecycle scripts

npm run typecheck              # tsc --noEmit for packages/core, packages/client and app
npm test --workspace=packages/core
npm test --workspace=packages/client
npm test --workspace=app
npm test --workspace=scripts   # hermetic: no network
```

Contract (from `contracts/`):

```bash
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
stellar contract build --locked --package sure_circles     # needs Stellar CLI 28.1.0
```

Circuit tests need a Circom 2.2.3 binary: set `CIRCOM_BIN` or put it on `PATH`, then
`npm test --workspace=circuits`. Download Circom only from the official `iden3/circom` release and check its
SHA-256 against the digest GitHub publishes for the asset.

### Reproducing generated files

Deterministic (the same inputs always give the same bytes; see [docs/ARTIFACT_PROVENANCE.md](docs/ARTIFACT_PROVENANCE.md)):

```bash
npm run gen:api-surface                        # packages/{core,client}/api-surface.json
npm run generate:all --workspace=test-vectors  # test-vectors/{poseidon,public-signals,wire-format}.json
```

Development trusted setup (slow, **not** reproducible: it uses fresh randomness every time):

```bash
cd circuits
npm run compile        # circom -> build/membership.r1cs and the witness WASM
npm run setup:dev      # DEV Powers of Tau + Groth16 phase 2; replaces any existing DEV keys
npm run verify-setup   # re-verifies the artifacts and runs a proof round trip
```

Running the setup again produces a different verification key, so everything derived from it (the contract test
fixtures, the XDR goldens and their hashes) must then be regenerated. Which generated files are committed, and which
are not, is explained in [docs/artifact-policy.md](docs/artifact-policy.md).

## Repository structure

```
sure-circles/
├── app/                 React + Vite browser app
├── circuits/            membership circuit template, config, build/setup/verify scripts, circuit tests
├── contracts/           Cargo workspace; circles/ is the Soroban contract (crate: sure_circles)
├── docs/                architecture, wire format, ADRs, audit scope, provenance, deferred features
├── packages/            core/ (crypto primitives) and client/ (TypeScript SDK)
├── scripts/             end-to-end and smoke helpers, maintenance checks
├── test-vectors/        generators and data for cross-implementation test vectors, XDR goldens
├── __mocks__/           vitest module mocks used by the app tests
└── justfile             thin wrappers around the offline npm commands
```

## Documentation

- [docs/architecture.md](docs/architecture.md), [docs/wire-format.md](docs/wire-format.md),
  [docs/errors.md](docs/errors.md), [docs/events.md](docs/events.md), [docs/glossary.md](docs/glossary.md)
- [docs/adr/](docs/adr/) architecture decision records
- [docs/audit/](docs/audit/README.md) audit scope and negative-test inventory
- [docs/ARTIFACT_PROVENANCE.md](docs/ARTIFACT_PROVENANCE.md) how each generated artifact was produced, with hashes
- [docs/artifact-policy.md](docs/artifact-policy.md) which generated files are committed
- [docs/deferred-features.md](docs/deferred-features.md), [docs/dependency-decisions.md](docs/dependency-decisions.md)

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md). Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License and attribution

MIT, see [LICENSE](LICENSE). This project is derived from the MIT-licensed Sharibo project; the original
copyright notice is retained. See [ATTRIBUTION.md](ATTRIBUTION.md).
