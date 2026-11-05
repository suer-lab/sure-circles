# Security Policy

## Status and supported versions

Sure Circles is in early development and has no releases, so there are no supported versions yet: only the
default branch is covered by this policy. It is **not audited**, it has **not been deployed** to any network, and
it must not be used with real funds. Nothing in it is production-ready or mainnet-ready.

## Scope

In scope:

- **Contract logic:** `contracts/circles/src/lib.rs` (authorization bypass, double claims, loss or theft of
  funds, storage or TTL handling that breaks nullifier or round invariants).
- **Circuit soundness:** `circuits/membership.template.circom` and the generator that instantiates it
  (forged proofs, missing constraints, unintended witnesses).
- **Proof and nullifier handling:** `packages/client/` (weak randomness, nullifier or identity derivation
  errors, replay).
- **Cryptographic primitives:** `packages/core/` (any divergence between implementations of the same
  primitive).
- **Secret handling in diagnostics:** `app/src/lib/debugBundle.ts` (secrets escaping the redaction guard).
- **Supply chain:** dependency, build and CI configuration that could ship attacker-controlled code.

## Reporting a vulnerability

**Do not report vulnerabilities in public issues.**

Use the repository's private vulnerability reporting (GitHub Security Advisories) once the repository is
published. Maintainers must enable that feature before publication.

<!-- TODO(maintainers): add a monitored security contact and a response-time commitment before publishing. -->

Please include a description, affected files, reproduction steps and your assessment of the impact. We ask
you to keep the report confidential until a fix is available and a disclosure date has been agreed.

## Disclosure expectations

- Good-faith research that avoids harming others is welcome. Test only against your own local or Testnet
  deployments, never against systems or funds you do not control.
- We will acknowledge a report, assess it, and agree a disclosure date with you. No response-time commitment is
  made yet (see the maintainer TODO above); one will be added before the repository is published.
- There is no bug bounty.

## Known limitations (not treated as vulnerabilities)

- **Testnet only.** No real value is intended to be at risk.
- **The trusted setup is a development setup.** The verification key, proving key and everything derived from
  them (test fixtures, XDR goldens, test proofs) come from a single-machine, single-contributor setup
  (`circuits/SETUP_TRANSCRIPT.md`). Whoever ran it could have kept the secret randomness and forged proofs, so it
  gives none of the guarantees of a multi-party ceremony. **No production ceremony has been performed.** Reports that
  merely say "the setup is not a production ceremony" are known and not vulnerabilities; reports about the setup
  tooling itself (for example weak randomness in `circuits/scripts/setup-dev.mjs`) are in scope.
- **Not audited.** There is no independent security audit of the circuit, contract or SDK.
- **No per-cycle claim limit.** The contract does not enforce one claim per member per cycle (ADR 002 is
  proposed, not implemented), so the same identity can claim in consecutive rounds.
- **Third-party Poseidon constants** are not independently verified.
- **Funding is public.** Only claim-side privacy is in scope.
