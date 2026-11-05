# Security Policy

## Status and supported versions

Sure Circles is **pre-production** early-development software and has no releases, so there are no supported
versions yet: only the default branch (`main`) is covered by this policy. It has **not had a formal security
audit**, it has **not been deployed** to any network, and it must not be used with real funds. Nothing in it is
production-ready or mainnet-ready.

The zero-knowledge setup in this repository is a **development / test setup only**, and a production trusted-setup
ceremony is still pending (see _Known limitations_ below).

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

Report privately through **GitHub private vulnerability reporting** (the repository's _Security_ tab, then
_Report a vulnerability_). That is the only private channel: there is no security email address.

Please include a description, affected files, reproduction steps and your assessment of the impact. Please do not
disclose a security-sensitive issue publicly, including in issues, pull requests, discussions or social media,
until we have coordinated with you and agreed a disclosure date.

## Disclosure expectations

- Good-faith research that avoids harming others is welcome. Test only against your own local or Testnet
  deployments, never against systems or funds you do not control.
- We will acknowledge reports and triage them promptly, then agree a disclosure date with you. This is a small
  volunteer-maintained project, so no fixed response-time commitment is made.
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
