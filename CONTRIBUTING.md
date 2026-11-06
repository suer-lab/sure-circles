# Contributing to Sure Circles

Thank you for your interest. Sure Circles is early-stage, security-sensitive software (zero-knowledge proofs
and smart contracts that hold funds). Small, well-reviewed changes are preferred over large ones. It is
pre-production, unaudited and not deployed anywhere.

## Ground rules

- Be kind; see the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Never report a vulnerability in a public issue or PR.** Use GitHub private vulnerability reporting as described
  in [SECURITY.md](SECURITY.md). If a bug you are working on turns out to be exploitable, stop and report it
  privately.
- Never commit secrets, `.env` files, private keys, or contribution entropy.
- Do not add dependencies casually. Each new dependency needs a reason in the PR and an exact version pin
  (see [docs/dependency-decisions.md](docs/dependency-decisions.md)). No install lifecycle hooks
  (`preinstall`, `install`, `postinstall`, `prepare`) in any manifest.
- Do not run unreviewed scripts or binaries from issues, PRs or third-party code.

## Toolchain

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 22 (`.nvmrc`; CI uses 22.20.0) | everything in TypeScript |
| npm | 11 (CI uses 11.21.1) | npm 10 cannot resolve the lockfile |
| Rust | 1.94.1 (`rust-toolchain.toml`) with `rustfmt` and `clippy` | contract work |
| Circom | 2.2.3 | circuit tests only |
| Stellar CLI | 28.1.0 | building the contract WASM only |

Download Circom and the Stellar CLI only from their official releases and compare the SHA-256 with the digest
GitHub publishes for the asset. You do not need them for most issues.

## Verified baseline

These pass on `main` and are what CI runs (see [docs/ci.md](docs/ci.md)). Run the ones relevant to your change from
the repository root.

```text
npm ci --ignore-scripts

# type-check (core, client, app have a script; use tsc directly for the rest)
npm run typecheck
npx tsc --noEmit -p scripts
npx tsc --noEmit -p app/e2e
npx tsc --noEmit -p .

npm test --workspace=packages/client
npm test --workspace=app
npm test --workspace=scripts
npm test --workspace=packages/core      # slow on purpose: about 5 minutes

npm run check:secrets -- --all
npm run check:stellar-sdk
```

Contract changes (from `contracts/`):

```text
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

Do not change `Cargo.lock` or `package-lock.json` unless your change needs it.

### Not yet green (known)

`npm run lint`, `npm run format:check` and `npm run check:adrs` currently fail on existing code (inherited
`no-explicit-any`, formatting, and a duplicate ADR number) and are **not** part of CI yet. Do not add lint
suppressions to get around them, and do not mix large formatting changes into an unrelated PR. The root
`npm test` also runs the circuit tests, which need Circom 2.2.3. `cargo deny` and `cargo audit` are not set up.

## Zero-knowledge artifacts: read before touching proofs

- Some proof tests need the **development proving key (zkey)** and witness WASM. They are **not committed** (see
  [docs/artifact-policy.md](docs/artifact-policy.md)). If an issue needs them, ask in the issue; the maintainers
  will say how to obtain the development assets.
- The trusted setup in this repository is a **single-machine development setup**. Do not regenerate, replace or
  "improve" it casually. Changing it changes the verification key and invalidates the committed fixtures, XDR
  goldens and manifests. A production ceremony is a separate, maintainer-led task.
- Generated and provenance files (`api-surface.json`, `test-vectors/`, XDR goldens, contract fixtures, the
  `docs/*.sha256` manifests, `circuits/verification_key.json`) are produced by scripts, not edited by hand. Regenerate
  them with the documented generator and explain the change; see [docs/ARTIFACT_PROVENANCE.md](docs/ARTIFACT_PROVENANCE.md).
- Never commit `*.zkey`, `*.ptau`, `*.r1cs`, `*.wasm` or witness files; they are ignored on purpose.

## Where does my code go?

| Change | Location |
| --- | --- |
| Soroban contract logic and its tests | `contracts/circles/src/` |
| Circuit template, config and circuit checks | `circuits/` |
| Pure cryptographic primitives | `packages/core/` |
| Client SDK (identity, tree, proving, contract calls) | `packages/client/` |
| Browser app | `app/` |
| End-to-end, smoke and maintenance scripts | `scripts/` |
| Test-vector generators | `test-vectors/` |
| Design decisions | `docs/adr/` (one ADR per decision) |

### Wire-format boundary

Anything that touches circuit public signals, the contract's `public_inputs`, or SDK encoding must update
**all three sides** in the same PR and be reviewed on all three. See [docs/wire-format.md](docs/wire-format.md).

## Development workflow

1. Open or pick an issue; discuss non-trivial changes first. Comment to say you are working on it.
2. Fork or branch, and keep the PR focused. `main` is protected: changes land through a pull request with passing
   CI, Code Owner review and resolved conversations.
3. Run the checks above that are relevant to your change.
4. Fill in the pull request template honestly, including what you did **not** test.

## Tests must be hermetic

Unit tests must not reach the network, read a developer's real `.env`, or depend on ambient environment
variables. Anything that touches Stellar Testnet belongs in the explicitly-named end-to-end or smoke scripts.

**Testnet and deployment work needs maintainer coordination.** Do not deploy the contract, create funded accounts
for the project, or run end-to-end or smoke scripts against a network on the project's behalf without agreeing it
in an issue first.

## Security-sensitive changes

Changes to `contracts/`, `circuits/`, `packages/core/` or the proof/nullifier code in `packages/client/`
need review by a maintainer with domain knowledge, and should include negative tests (tampered input,
replay, wrong round, forged public input). Issues carrying the `security-sensitive` label mark such code paths;
the label does not mean a vulnerability has been disclosed.

## Releases

There are no releases yet. A release will require a reproducible build, regenerated and documented
cryptographic setup, a recorded contract deployment, and a changelog entry.
