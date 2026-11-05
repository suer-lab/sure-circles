# Artifact provenance

This records the generated artifacts that exist in the repository, how each was produced, and what is
**not** present. It covers only deterministic, local artifacts. It says nothing about trusted setup, because
none has been performed.

**No generated artifact from the inherited source workspace was reused.** Every file below was
produced in this repository by the generator named in its row, from this repository's source.

Machine-readable hashes: [deterministic-artifacts.sha256](deterministic-artifacts.sha256) (`sha256sum -c`
format, paths relative to the repository root).

## Environment

|                                   |                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Date generated                    | 2026-11-05                                                                   |
| Node.js                           | 22.20.0                                                                      |
| TypeScript (api-surface)          | 6.0.3                                                                        |
| `poseidon-bls12381` (poseidon)    | 1.0.2                                                                        |
| Network used                      | none                                                                         |
| External tools used               | none (no circom, snarkjs CLI, cargo, Stellar CLI, Docker, or Git)           |
| Randomness used                   | none (fixed seeds, deterministic arithmetic)                                 |

Each generator was run twice; every output was byte-identical on the second run.

## Artifacts

| Path                                | Purpose                                                                                      | Generator                                      | Key dependencies                      | Deterministic | SHA-256                                                            | Trust status |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | ------------- | ------------------------------------------------------------------ | ------------ |
| `packages/core/api-surface.json`    | Snapshot of the core package's public exports (13 entries), checked by `api-surface.test.ts`  | `scripts/maintenance/gen-api-surface.mjs`      | TypeScript 6.0.3 (compiler API)       | yes           | `22938ebfb155a92bc40472350a7253b6a0a58d464b36f98c325a09fdd47bd138` | not trust-sensitive |
| `packages/client/api-surface.json`  | Snapshot of the client package's public exports (125 entries), checked by two client tests    | `scripts/maintenance/gen-api-surface.mjs`      | TypeScript 6.0.3 (compiler API)       | yes           | `ae5aa9d17f9621058b695ebd7e6007d05a381637755b6f1792a37e1518711e67` | not trust-sensitive |
| `test-vectors/poseidon.json`        | Poseidon pair vectors, commitment/nullifier examples, a 4-level Merkle example, G1/G2 layout | `test-vectors/generate.mjs`                    | `poseidon-bls12381` 1.0.2, Node webcrypto | yes       | `a5cdeaaa00235a0513ceffae125f503a1c4bda06e717771bb0800d220fb4e0f6` | not trust-sensitive |
| `test-vectors/public-signals.json`  | Ordered public-signal manifest (four signals), read by `docs-structure.test.mjs`            | `test-vectors/gen-public-signals.mjs`          | circuit source text only              | yes           | `2fc75cf0348e709a69e221de45379da6440653b4f2a88899d094d401ac2403a1` | not trust-sensitive |
| `test-vectors/wire-format.json`     | External-nullifier known answers, G1/G2 byte layouts, public-signal vector, IC-length rule   | `test-vectors/gen-wire-format.mjs`             | Node webcrypto; `poseidon.json`, `public-signals.json` | yes | `652abc6591069ab2160ba97b76251c14b19f3be91f675f269bd9dc2a9104c995` | not trust-sensitive |

Generator and documentation sources written or rewritten in this phase (hashes for traceability):

| Path                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `scripts/maintenance/gen-api-surface.mjs`  | `db1d2cacce4b6ecccb2b7b5457c21365ecf43d3f9f11b723a5fde4d2395904f0` |
| `test-vectors/generate.mjs`                | `e6e374a3048efe4851652626f69181ea123f32d8393c39b90ca28a51c76c2222` |
| `test-vectors/gen-public-signals.mjs`      | `88aba978e56c79397bf77e8651ecfa76314da5ddf801e514e7db9744c5eb632b` |
| `test-vectors/gen-wire-format.mjs`         | `e8c10051cd662f5a7f83f310f53518105f38e72871422b9a5ff2c49e99845898` |
| `justfile`                                 | `b0e5510c7c6d0ed4d51c27659aca058e64a5753e3307b958b56a0ca9c9d41ca8` |
| `packages/client/README.md`                | `08e4ecb7835e91f6cf772486b3e394627082fcff17c58985470b989675239c35` |

## Notes on what each artifact does and does not show

- **`api-surface.json`** is derived from source by the compiler API (nothing is imported or executed). Its
  categorisation mirrors the rules in each package's `api-surface.test.ts`, and the "types" section only lists
  types declared in the files that test scans. Because it is derived from the current barrel, it detects
  _change_ in the public API; it does not judge whether the API is right.
- **`poseidon.json`** is produced by the same Poseidon implementation the client uses. It is a regression pin
  and is cross-checked by the independent core tests; it is not independent evidence of correctness. The
  circuit-side comparison (`circuits/test/membership.test.js`) has not been run.
- **`wire-format.json`** uses the standard BLS12-381 generator points for the G1/G2 layouts; the generator
  asserts both lie on their curves. It contains no verification key and no value from a setup.
- The old wire-format generator read `circuits/verification_key.json` and hard-coded a three-signal order and
  decimal values from an earlier protocol version. It was rewritten rather than reused.

## Intentionally not generated

| Artifact                                                        | Why it is absent                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `test-vectors/xdr/*.b64` (XDR goldens)                          | Written by the contract's Rust test (`xdr_golden`); needs cargo, and the Circle and VerificationKey goldens embed a verification key. |
| `circuits/constraints.json`                                     | Needs circom to compile the circuit and read its `.r1cs`.                                                  |
| `circuits/verification_key.json`, `.zkey`, `.ptau`, `.wtns`, `.r1cs`, setup transcript, `artifact-hashes.json`, `verify-setup.sh` | Trusted-setup or circom-derived material; a later phase. |
| Contract and circuit WASM, deployment records, Testnet evidence | Need cargo, circom or a live network.                                                                      |

Because the XDR goldens are absent, the four `xdr golden` tests in `packages/client/src/contract.test.ts`
currently pass vacuously: each returns early with a warning when its golden file is missing. They verify
nothing until the goldens exist.

---

# DEVELOPMENT trusted-setup artifacts (Phase 8B)

> **DEVELOPMENT / TEST ONLY. NOT FOR PRODUCTION.** These keys come from a single-machine, single-contributor
> setup. No production security claim is made. A production multi-party ceremony is deferred and is a separate
> task. The deterministic artifacts above and the development setup artifacts below are different categories:
> the former can be regenerated byte-for-byte from source; the latter embed fresh randomness and will differ on
> every run.

**No generated artifact from the inherited source workspace was reused**: no ptau, zkey, r1cs, wasm,
verification key, entropy, transcript or circom binary.

Machine-readable hashes: [dev-setup-artifacts.sha256](dev-setup-artifacts.sha256). Full ceremony record:
`circuits/SETUP_TRANSCRIPT.md`.

## Toolchain

| Tool | Version | Source | SHA-256 |
| --- | --- | --- | --- |
| circom | 2.2.3 | `https://github.com/iden3/circom/releases/download/v2.2.3/circom-windows-amd64.exe` (tag `v2.2.3`, commit `ad44e915a12bb047b05745c2884aad9cc8326bc6`) | `e43f132ee6f0aa79b705beceb59c2a7e6a54d7bdeab917ca34e9fc1951d185e1` |
| snarkjs | 0.7.6 (installed npm library; CLI not used) | lockfile | n/a |

GitHub publishes a per-asset SHA-256 digest for the release; the download matched it (and the 12,039,168-byte
size) before first execution. There is no separate upstream checksum file or signature. The binary is stored
outside the project, in a separate tools directory.

## Artifacts

| Path | Purpose | Generator | SHA-256 |
| --- | --- | --- | --- |
| `circuits/membership.circom` | concrete circuit source (depth 4), gitignored | `scripts/gen-circuit.cjs` | `bb29c23e0662eb015db51728c058c22de4c148990a897eb2ab99ec38a09ba9af` |
| `circuits/constraints.json` | committed constraint counts for depths 4, 8, 16, 20 | `scripts/check-constraints.cjs` measurements | `86089778f14fd97a559ad0320d620c194a06e0aad71637c8932c999a23469d70` |
| `circuits/build/membership.r1cs` | R1CS: 3757 constraints, 3766 wires, 3 public inputs + 1 output, 10 private | circom 2.2.3 | `c58e4a33c22a9231266b7e6d93ae031b372ec9e7740dc1e323f0c135b79666d0` |
| `circuits/build/membership.sym` | symbol map | circom 2.2.3 | `6226453316f6bb0b964260f7005458b55858fcfe188d9db6419034ccb8969188` |
| `circuits/build/membership_js/membership.wasm` | witness generator | circom 2.2.3 | `400c9307b73629f1fb644e17e84912bb2b4b06a55823bbd6aed9ac9dd25a708a` |
| `circuits/build/dev-setup/DEV_pot13_final.ptau` | DEV Powers of Tau, power 13, 1 local contribution, phase2-prepared | `scripts/setup-dev.mjs` | `6c07daadcf1298ee14f25f7db6379f40dd3246b268fcd7ee0585ee145cb21b48` |
| `circuits/build/membership_DEV_final.zkey` | DEV proving key, 1 local contribution | `scripts/setup-dev.mjs` | `0dd6142a160bdd643fc6b5e4ea39e33f54dac05bcfba4b70dec25da088808572` |
| `circuits/verification_key.json` | exported verification key (nPublic 4, IC 5, bls12381) | `scripts/setup-dev.mjs` | `338833959f832571f5b6c84510945576da6e2644038d9a602dd3354c945a00ec` |
| `circuits/artifact-hashes.json` | hashes and metadata of the above | `scripts/setup-dev.mjs` | `641a372650a5a9d8f0f58f1a891810342ff74903dbad65de9da0a017ebd9a26f` |
| `circuits/SETUP_TRANSCRIPT.md` | DEV setup record | `scripts/setup-dev.mjs` | `f1672923582b55eaa696011e333b3f380fa9ab412b60bcc01d5ef5abc2974b62` |

Power 13 was used: the circuit needs at least power 12 (3757 + 3 public + 1 output rounded up to a power of
two), plus one power of headroom. The intermediate Phase 1 files and the zero-contribution zkey were deleted;
their hashes are in the transcript. Contribution entropy is fresh from the OS CSPRNG each run and is never
stored.

Verification performed (`scripts/verify-setup.mjs`, offline): artifact hashes, `zKey.verifyFromR1cs`, the
committed verification key equals a fresh export, and an in-memory proof round-trip on the deterministic vector
whose public signals are exactly `[nullifierHash, root, externalNullifier, recipientHash]`; a tampered
`externalNullifier` is rejected. Witness and proof were never written to disk. The mocha circuit suite also
independently reproduces `test-vectors/poseidon.json` from the circuit.

## Defects found and fixed along the way

- `membership.template.circom` declared `signal input externalNullifier` twice (circom error T2008). The
  duplicate was removed; semantics are unchanged.
- `verificationKeyToContractFormat` passed snarkjs `[c0, c1]` pairs to the G2 packer in the wrong order,
  contradicting `docs/wire-format.md` and `encodeG2`; a real verification key exposed it. Fixed in
  `prove.ts`.

## Still absent

XDR goldens (`test-vectors/xdr/`), contract WASM, deployment records, Testnet evidence.

---

# Phase 8C: Rust toolchain, contract test fixtures and XDR goldens

Machine-readable hashes: [phase8c-artifacts.sha256](phase8c-artifacts.sha256). These are development and test
artifacts. Nothing here is deployment evidence.

**No inherited ceremony material was reused.** The previous Rust test fixtures embedded two inherited
verification keys, three proofs and their public values; all of them were removed and replaced by fixtures
generated from the Phase 8B DEVELOPMENT setup.

## Rust toolchain

| | |
| --- | --- |
| Rust | 1.94.1 (`e408947bf 2026-03-25`), pinned by `rust-toolchain.toml` |
| Cargo | 1.94.1 (`29ea6fb6a 2026-03-24`) |
| Components / target | rustfmt, clippy, `wasm32v1-none` |
| Source | official Rust distribution host `static.rust-lang.org`, via `rustup toolchain install 1.94.1 --profile minimal` |
| rustup | self-updated 1.29.2 to 1.29.3 as a side effect of that install (not separately requested) |
| soroban-sdk | 28.0.0 (`soroban-env-host` 28.0.2, `stellar-xdr` 28.0.0) |
| Lockfile | `contracts/Cargo.lock` unchanged (`27458438…89e3`); every cargo command used `--locked` |
| Network | cargo fetched 26 crates already listed in `Cargo.lock` that were missing from the local cache; nothing else |
| cargo-audit, cargo-deny | not installed, not run (the Stellar CLI is covered in the Contract WASM section) |

## DEV Rust test fixtures

| Path | Purpose | SHA-256 |
| --- | --- | --- |
| `contracts/circles/test-fixtures/dev-groth16-fixtures.json` | canonical fixture: DEV verification key, root, and two proofs for the same member (circle 0, round 0 to recipient r0 and round 1 to recipient r1) with public signals | `b9a430b8dc399f132524d4afe5140b433591ec5292a38d0d0d13bae99ee63fd9` |
| `contracts/circles/src/test/dev_fixtures.rs` | Rust constants generated from the JSON (`#[rustfmt::skip]`, do not edit) | `4f504e280cc17bc736a44ef4114d125b197d1fbb5215855de7d72572690087f9` |

- **Generator:** `circuits/scripts/gen-contract-fixtures.mjs` with snarkjs 0.7.6 (library), the current
  `membership.wasm`, `membership_DEV_final.zkey` and `verification_key.json` (`338833959f83…a00ec`). Modes:
  generate, `--check` (re-verify committed proofs against the current key), `--render-rust`.
- **Inputs:** deterministic synthetic members derived from SHA-256 labels; no private witness values are stored.
- **Determinism:** the verification key, tree, root and public signals are deterministic. Proof bytes are not
  (snarkjs does not let the prover randomness be seeded), so the fixtures are generated once and committed.
- **Verification:** both proofs verify against the DEV key; public signals are exactly
  `[nullifierHash, root, externalNullifier, recipientHash]`; tampering with `externalNullifier` or
  `recipientHash` makes verification fail. A Rust test checks the contract's own external-nullifier and
  recipient-hash derivations equal the generator's.
- **Network:** none.

## XDR goldens

Generated by the authoritative Rust test `xdr_golden` (`UPDATE_GOLDEN=1 cargo +1.94.1 test --locked --lib
xdr_golden`) from the fixtures above and deterministic contract-address placeholders. Generated twice,
byte-identical. Each file exists in `test-vectors/xdr/` (read by the TypeScript tests) and in
`contracts/circles/test_snapshots/xdr_goldens/` (read by the Rust test); the copies are identical.

| File | Encodes | DEV VK / proof embedded | SHA-256 |
| --- | --- | --- | --- |
| `circle.v2.b64` | a `Circle` (schema v2: size 5, contribution 1,000,000, round 0, the DEV VK and the DEV root) | VK yes, root yes | `e78be2f44115553e19f6f0d810b59736b1f920bc6709473bfce6f8c09f521d9e` |
| `verification_key.v2.b64` | the DEV `VerificationKey` | VK yes | `251f6d289595a291be1191f78481945d99eb6dcb3c791ca994d60f7e184fb738` |
| `proof.v2.b64` | the round-0 `Proof` | proof yes | `32fd53ababa391fc6eed1e4adf59a7e33bf361448e7d52dda27289fb54a1c0a8` |

Because the proof bytes are not reproducible, regenerating the fixtures changes the proof golden and, if the
setup is rerun, all three.

## Contract WASM

Built with the official Stellar CLI, from current source only. This is a local development build, not deployment
evidence: nothing was uploaded, deployed or invoked, and no network was used by the build or the inspection.

| | |
| --- | --- |
| Artifact | `contracts/target/wasm32v1-none/release/sure_circles.wasm` (gitignored build output) |
| Size | 37,415 bytes (the CLI's own built-in optimize step shrank it from 41,520) |
| SHA-256 | `b6428dc36d2b8de25147fde750e13bb33677840510aabd83c5a877d743f3fb90` |
| Build command | `stellar contract build --locked --package sure_circles` (run in `contracts/`) |
| What the CLI ran | `cargo rustc --locked --manifest-path=circles\Cargo.toml --crate-type=cdylib --target=wasm32v1-none --release`, with `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1` set by the CLI itself |
| Rust / Cargo | 1.94.1 / 1.94.1, target `wasm32v1-none` |
| soroban-sdk | 28.0.0 |
| Lockfile | `contracts/Cargo.lock` unchanged (`27458438…89e3`) |
| Reproducibility | rebuilt after deleting the whole `wasm32v1-none` target directory: byte-identical (same machine and path) |
| Embedded metadata | rsver 1.94.1, rssdkver 28.0.0, rssdk_spec_shaking 2, cliver 28.1.0, protocol v28 |

**Stellar CLI 28.1.0** (not part of the project; stored outside it, in a separate tools directory):

| | |
| --- | --- |
| Source | `https://github.com/stellar/stellar-cli/releases/download/v28.1.0/stellar-cli-28.1.0-x86_64-pc-windows-msvc.tar.gz` (tag `v28.1.0`, commit `c0f4d0da891bbf214c08b8c5035ae6db80e9a3bd`) |
| Archive | 22,658,751 bytes; SHA-256 `5011c20fe8020cd375988f971e9324f392f384b85b14af8f53ca68d85953a9c2` = the GitHub-published digest (verified before extraction) |
| `stellar.exe` | SHA-256 `610cd860e8303e78576046ee806d2120ee0a8c4e3cedc945dbc0507eb89f03c7`; `stellar --version` reports 28.1.0 (`c0f4d0da…`), stellar-xdr 28.0.0 |
| Network use | only the download above |

**Spec inspection** (`stellar contract info interface|meta|env-meta|hash --wasm <local file>`; local only):

- 16 exported functions: `create_circle`, `fund`, `claim`, `cancel_circle`, `propose_admin`, `accept_admin`,
  `expire_round`, `get_circle`, `get_circle_meta`, `get_circle_count`, `get_vk`, `get_pot`, `get_round`,
  `get_status`, `get_contributors`, `has_claimed`.
- Types: `Proof` (96/192/96-byte points), `Circle`, `CircleMeta`, `VerificationKey` (IC points are 96 bytes),
  `Error` (codes 1 to 12), and seven events (`CircleCreated`, `CircleFunded`, `CircleClaimed`, `CircleCancelled`,
  `AdminProposed`, `AdminAccepted`, `RoundExpired`).
- No old Sharibo identifiers. `claim` takes `(circle_id, recipient, nullifier_hash, external_nullifier, proof)`.
- Finding: error codes 11 (`InvalidRecipient`) and 12 (`RoundNotExpired`) are in the contract spec but not in
  `docs/errors.md` or the client's error mapping (recorded in `docs/deferred-features.md`).
- `stellar contract info build` reports no `source_repo` entry: this is a local build with no GitHub attestation.

## Source defects fixed while preparing these artifacts

- `contracts/circles/src/lib.rs`: splice damage repaired in favor of the `storage.rs` / `events.rs` generation
  (duplicate constants and imports, undefined keys, a stale funded-event publish, a duplicated `claim` check).
- `contracts/circles/src/test.rs`: soroban-sdk 28 event API (`all_events` helper); three admin and expiry event tests
  read `circle_id` from the topic as `docs/events.md` specifies; the two-round test asserts nullifiers persist.
- `packages/client/src/contract.test.ts`: repo-relative paths climbed one level too high, so the goldens and the
  verification key were never found (the tests returned early); `toXDR("base64")` for SDK 17.
