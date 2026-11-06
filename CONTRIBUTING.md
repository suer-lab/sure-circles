# Contributing to Sure Circles

Thank you for your interest. Sure Circles is early-stage, security-sensitive software (zero-knowledge proofs
and smart contracts that hold funds). Small, well-reviewed changes are preferred over large ones.

> The commands below pass on a machine with the pinned toolchain (see the README). Some end-to-end, smoke and browser
> checks need a live network or a built app and are not part of the offline gate; see
> [docs/deferred-features.md](docs/deferred-features.md).

## Ground rules

- Be kind; see the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Never report a vulnerability in a public issue or PR.** Follow [SECURITY.md](SECURITY.md).
- Never commit secrets, `.env` files, private keys, or contribution entropy. Generated artifacts follow
  [docs/artifact-policy.md](docs/artifact-policy.md): the verification key, vectors, goldens and manifests are
  committed; proving keys (`*.zkey`), Powers of Tau (`*.ptau`), witnesses and build output are git-ignored on purpose.
- Do not add dependencies casually. Each new dependency needs a reason in the PR and an exact version pin
  (see [docs/dependency-decisions.md](docs/dependency-decisions.md)). No install lifecycle hooks
  (`preinstall`, `install`, `postinstall`, `prepare`) in any manifest.
- Do not run unreviewed scripts or binaries from issues, PRs or third-party code.

## Where does my code go?

| Change                                               | Location                           |
| ---------------------------------------------------- | ---------------------------------- |
| Soroban contract logic and its tests                 | `contracts/circles/src/`           |
| Circuit template, config and circuit checks          | `circuits/`                        |
| Pure cryptographic primitives                        | `packages/core/`                   |
| Client SDK (identity, tree, proving, contract calls) | `packages/client/`                 |
| Browser app                                          | `app/`                             |
| End-to-end, smoke and maintenance scripts            | `scripts/`                         |
| Test-vector generators                               | `test-vectors/`                    |
| Design decisions                                     | `docs/adr/` (one ADR per decision) |

### Wire-format boundary

Anything that touches circuit public signals, the contract's `public_inputs`, or SDK encoding must update
**all three sides** in the same PR and be reviewed on all three. See [docs/wire-format.md](docs/wire-format.md).

## Development workflow

1. Open or pick an issue; discuss non-trivial changes first.
2. Branch from the default branch and keep the PR focused.
3. Run the checks relevant to your change (from the repository root, Node 22.x per `.nvmrc`):

   ```text
   npm run lint
   npm run format:check
   npm run typecheck
   npm test
   npm run check:secrets
   npm run check:stellar-sdk
   ```

   Contract changes also need the contract test suite (`cargo test` in `contracts/`) and `cargo deny check`.

4. Fill in the pull request template honestly, including what you did **not** test.

## Tests must be hermetic

Unit tests must not reach the network, read a developer's real `.env`, or depend on ambient environment
variables. Anything that touches Stellar testnet belongs in the explicitly-named end-to-end or smoke scripts.

## Security-sensitive changes

Changes to `contracts/`, `circuits/`, `packages/core/` or the proof/nullifier code in `packages/client/`
need review by a maintainer with domain knowledge, and should include negative tests (tampered input,
replay, wrong round, forged public input).

## Releases

There are no releases yet. A release will require a reproducible build, regenerated and documented
cryptographic setup, a recorded contract deployment, and a changelog entry.
