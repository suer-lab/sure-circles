# Deferred features

This lists functionality that existed, in some form, in the inherited source but was deliberately **not**
carried into the current baseline. The inherited app and hook were damaged by automated merges (two or more
incompatible generations of `useCircleFlow` and `App.tsx` were fused together). The baseline keeps the last
internally consistent hook (`app/src/hooks/useCircleFlow.ts`) as the source of truth and trims `App.tsx` and its
tests to what that hook actually provides.

Nothing below is a claim that the old code worked. It was corrupted, untested in this repository, and is not
recoverable as-is. Each item is a candidate for a deliberate, tested reimplementation.

## What the baseline supports

`useCircleFlow` provides: landing/circle screen state, `circlePhase`, `busy`, `error`, `contributionXlm`,
`members`, `circleId`, `round`, `pot`, `claimantIndex` / `setClaimantIndex`, `claimResult`, `rejection`,
`previousCircleId`, `fundedCount`, `fullyFunded`, `feeEstimate`, `fundingResults`, and the actions
`startCircle`, `fundMember`, `fundAllMembers`, `retryFailedFunding`, `doClaim`, `claimAgain`, `resetToLanding`.
The app surfaces: create a 5-member demo circle, fund each member, pick a claimant, prove and claim to a fresh
address, replay the nullifier to show rejection, and reset.

`fundAllMembers`, `retryFailedFunding`, `fundingResults` and `feeEstimate` exist in the hook but are not wired
into `App.tsx`.

## Deferred items

### Resume-state UX (`resumePrompt`, `loadState`, `dismissResumePrompt`)

- **Existed:** a prompt to resume a circle after a page refresh, with session persistence of identities and
  secrets (`lib/session.ts`, `lib/bigintJson.ts`).
- **Not recovered:** the clean hook has no persistence; the old logic lived in a different hook generation.
  Persisting demo secret keys to browser storage is also a security decision that needs a fresh review.
- **Still present:** `lib/session.ts` and `lib/bigintJson.ts` (and their tests) remain but are not used by the app.
- **To implement:** decide what may be persisted, write the hook support and tests, then add the prompt.

### Freighter-specific funding flow (`hasFreighter`, `fundWithFreighter`)

- **Existed:** funding a member with a Freighter wallet signature instead of a throwaway key.
- **Not recovered:** the clean hook never imports `@stellar/freighter-api`.
- **Still present:** `lib/wallet.ts`, `wallet.freighter.ts`, `wallet.demoKeypair.ts` (signer adapters, with tests)
  and the optional `hasFreighter`/`onFundWithFreighter` props on `FundingList`.
- **To implement:** hook methods for wallet connection and signing, error mapping, and tests; check the
  `@stellar/freighter-api` 6.0.1 and SDK 17.2.0 pairing, which is untested.

### Richer claim-stage and proving telemetry (`claimStage`, `proveElapsedSeconds`, `isProving`, `stepTimings`)

- **Existed:** per-stage labels (artifacts, proving, verifying, funding, submitting), an elapsed-seconds counter,
  and step timings fed to the debug bundle.
- **Not recovered:** the clean hook only exposes a `busy` message string.
- **Still present:** `ClaimSection` accepts optional `claimStage` / `proveElapsedSeconds` / `isProving`;
  `ClaimResult.proofDurationMs` / `verifyTimeMs` are now optional; the debug bundle accepts timings (the app
  passes none).
- **To implement:** record stage and timing state in the hook, then pass it through.

### Cancel-circle UI and admin controls (`cancelled`, `hasAdmin`, `onChainContributors`, `doCancelCircle`)

- **Existed:** a cancel button and a "cancelled" banner, driven by on-chain contributors.
- **Not recovered:** the clean hook neither tracks cancellation nor exposes the admin key.
- **Contract/client support:** the contract has `cancel_circle`, `get_contributors` and `get_status`; the client
  exports `cancelCircle`, `getContributors`, `getCircleStatus`.
- **To implement:** hook state for admin/cancelled/contributors, a confirmation flow, and tests including refunds.

### Fee display (`feeBps`, `feeRecipient`)

- **Existed:** showing the protocol fee next to the pot.
- **Not recovered:** the hook creates circles with `feeBps: 0` and does not read fee fields back.
- **Contract/client support:** `create_circle` accepts a fee and `CircleView` carries `fee_bps` / `fee_recipient`.
- **To implement:** read fee fields into hook state and render them; add fee-path tests.

### Honest circle size and step state (`circleSize`, `step`)

- **Baseline:** the circle size is the constant `CIRCLE_SIZE` from `config.ts`, and the stepper is derived in
  `App.tsx` from `claimResult` and `fullyFunded`. The "create" step is never shown as the active one.
- **To implement:** a real state machine (see `state/circleMachine.ts`, below) if finer steps are wanted.

### Previous-circle toast and failure retry (`prevCircle`, `Failure` toasts)

- **Existed:** a richer landing screen with a failure toast that could retry the failed step.
- **Not recovered:** nothing in the clean hook produces failures.
- **Still present:** `Landing` accepts optional `prevCircle` / `failure` / `onDismissFailure`; `Toaster` exists.

### Nullifier-claimed read (`nullifierClaimed`)

- **Existed:** showing `has_claimed` after a claim.
- **Contract/client support:** contract `has_claimed`; client `hasClaimed`.
- **Still present:** optional `nullifierClaimed` prop on `ResultCard`.

### Admin rotation and round expiry client APIs

- **Existed:** `proposeAdmin`, `acceptAdmin`, `expireRound` wrappers in `contract.ts` and `sdk.ts`.
- **Not recovered:** their bodies were fused with `createCircle`/`fund`/`claim` in the damaged file, so the
  last clean `contract.ts` (which lacks them) was restored.
- **Contract support:** `propose_admin`, `accept_admin`, `expire_round` exist and are tested in the contract suite.
- **Client support that does exist:** typed errors and decoder cases for every contract error code the contract defines
  (`InvalidRecipientError` #11 and `RoundNotExpiredError` #12 were added in Phase 8D), so the wrappers will be able
  to surface them. Code 9 (`InvalidFeeParams`) intentionally has no typed class.
- **To implement:** write the three wrappers from the contract signatures, add SDK methods and tests.

### SDK event log in the UI (`hooks/useSdkEvents.ts`)

- **Existed:** collecting SDK observability events for the debug bundle.
- **Still present:** the hook and its test, importing `setArtifactOnEvent` from the internal entry point. The
  app does not call it, so the debug bundle's `recentEvents` is never populated.

### Abandoned lazy `CircleScreen` architecture and landing-bundle budget

- **Existed:** a separate lazy-loaded circle screen plus `Shell.tsx` and a bundle-size budget check that kept
  the proving stack out of the landing page.
- **Removed:** `app/src/screens/CircleScreen.tsx`, `app/src/components/Shell.tsx`,
  `app/scripts/check-bundle-budget.mjs`, the `build.manifest` Vite setting and the `check:bundle` script.
- **To implement:** if code-splitting is wanted, redesign it on top of `useCircleFlow` (lazy-load the circle
  view and the SDK) and re-add a budget check.

### Unused state machine (`state/circleMachine.ts`)

- A large reducer-based state machine exists and is covered by its own tests, but the app does not use it. Only
  its `Failure` type is imported (by `Landing` and `Toaster`). Decide whether to adopt it as the hook's core or
  remove it.

### Bounded, per-signer client connection cache

- **Existed:** `packages/client/src/contract.test.ts` (three tests) expects `connect` to cache clients
  separately per signer, refresh event handlers on a cache hit, keep read-only clients under a separate
  identity, and evict least-recently-used entries at a bound. The damaged `contract.ts` called a
  `getCachedContractClient` helper that is defined nowhere in the history.
- **Not recovered:** the restored `contract.ts` has a simpler cache without those semantics.
- **Intent (to implement):** (1) cache keyed by contract id + signer identity, so two signers never share a
  client; (2) a cache hit must re-attach the caller's event handlers; (3) read-only clients (no signer) use
  their own cache identity; (4) the cache is bounded and evicts the least recently used entry.
- **Status:** the three tests are `test.skip` in `packages/client/src/contract.test.ts` with a pointer here:
  "connect caches separately by signer and refreshes event handlers", "read-only clients use a separate
  cache identity", and "contract client cache evicts the least recently used entry at its bound". Un-skip
  them when the feature exists. The other contract tests (including the cache-clearing one) stay active.

### Locale completeness

- **Policy:** English (`en.ts`) is canonical. `t()` falls back to English per key when a locale lacks it, so a
  gap shows English text, never the raw key. No translations were invented.
- **Keys awaiting verified translation** (listed in `AWAITING_TRANSLATION` in `locales/locales.test.ts`, which
  fails if a gap is unrecorded or a recorded gap is filled):
  - `ar`: `error.contribution.empty`, `.not_a_number`, `.not_positive`, `.out_of_range`, `.pot_overflow`,
    `.too_many_decimals`, `.unaffordable`, `error.invalidCircleParams`, `landing.contributionLabel`.
  - `step.label` (English "Progress") in `ar`, `es`, `fr`, `hi`, `pt`, `tl`, `yo`, `zh`.
- **Mostly untranslated locales:** a comparison of values against `en.ts` (146 keys) shows that `fr`, `hi`, `pt`, `tl`,
  `yo` and `zh` still hold English text for about 101 to 104 of their 145 keys, so those six are largely English copies
  rather than translations. `ar` and `es` differ from English almost everywhere (3 and 6 identical values, likely names
  and symbols). Every key resolves, but the six locales need real translations before being advertised as supported.
- **`busy.generating`:** the seven locales that hard-coded "5" now use `{count}` in the same position (digit
  swapped for the placeholder; wording unchanged).

## Unused files after this trimming

`hooks/useSdkEvents.ts`, `lib/session.ts`, `lib/bigintJson.ts`, `lib/wallet.ts`, `lib/wallet.freighter.ts`,
`lib/wallet.demoKeypair.ts`, and the reducer in `state/circleMachine.ts` are not reachable from `main.tsx`.
They were kept because each has tests and may be reused by the items above.

### Artifact loader factory and runtime artifact hash check

- **Not a lost feature:** `createArtifactLoader` (an instance-per-loader factory with `prefetch`/`getProgress`/
  `subscribe`) appears in exactly one inherited version of `artifacts.test.ts` and in no version of
  `artifacts.ts`. The same assertions existed earlier against the module-level API, which is what the client
  ships (`prefetchMembershipArtifacts`, `startArtifactPrefetch`, `subscribeToArtifactPrefetch`, ...). The tests
  were rewritten against that API; the factory was not recreated.
- **Deferred:** the client does not verify downloaded circuit artifacts against a hash at runtime. Integrity is
  checked at build/sync time by `circuits/scripts/verify-artifacts.mjs` (via `sync-circuit.mjs`). A browser-side
  check (for example against `artifact-hashes.json`) would be a new feature.

### Cycle-scoped nullifiers (ADR 002) and nullifier clearing

- **Existed:** a comment in `claim` promising that the nullifier list is cleared at cycle boundaries, and a
  contract test asserting `has_claimed` is false after the round advances. No inherited version of the contract
  implemented the clearing, and ADR 002 is still "Proposed".
- **Current behavior:** nullifiers are recorded for the life of the circle (`has_claimed` is true for any past
  round). Because the external nullifier changes every round, the same identity still gets a fresh nullifier
  hash each round and can claim consecutive rounds. The test now asserts this.
- **To implement:** decide ADR 002 (cycle-scoped external nullifier or clearing at `round % size == 0`), change
  `claim`, the circuit/client external-nullifier derivation if needed, and update the tests and `has_claimed` docs.
- **Note:** a property test in `contracts/circles/src/test.rs` models clearing at cycle boundaries. It exercises a model,
  not contract behavior.

### Orphaned Rust test modules (`contracts/circles/src/test/{auth,bench,cancel,reentrancy}.rs`)

- **State:** no `mod` line includes them, so they are not compiled or run (merge damage). `auth` and `cancel`
  compile and pass on the DEV fixtures when included, but duplicate coverage already in `test.rs`.
- **Stale:** `reentrancy` (reverts with a host-level `InvalidAction` and expects older error codes) and `bench`
  (claims to an arbitrary recipient; proofs are now recipient-bound, issue #266) fail when included.
- **To implement:** rebuild the reentrancy harness and the CPU benchmark against the current contract, then add
  `mod` lines. Their fixture helper names were updated to the generated DEV fixtures.

### Production trusted-setup ceremony

- **Current state:** the only Groth16 setup is a DEVELOPMENT setup (`circuits/SETUP_TRANSCRIPT.md`): one machine, one
  contributor per phase, a Powers of Tau of power 13. It gives none of the trust assumptions of a multi-party ceremony.
- **Consequence:** the verification key, the DEV zkey, the Rust test fixtures, the XDR goldens and the built contract
  WASM's test data all derive from it. A production ceremony means regenerating every one of them.
- **Not implemented:** a ceremony coordination process, independent contributions with verifiable transcripts, a random
  beacon, publication of contribution hashes, and a production-sized Powers of Tau.

### Circuit tooling not carried over

- **Present:** `compile.mjs`, `setup-dev.mjs`, `verify-setup.mjs`, `verify-artifacts.mjs`, `check-constraints.cjs`,
  `check-poseidon-constants.mjs`, `gen-contract-fixtures.mjs`.
- **Not carried over:** the inherited standalone prove, benchmark and ceremony-contribute scripts. They were not rewritten
  because their roles are covered by the scripts above or belong to the production ceremony.

### justfile scope

- **Current state:** the `justfile` only wraps offline npm commands (typecheck, lint, unit tests, deterministic artifacts).
- **Missing recipes:** contract build/test (the Rust commands and `stellar contract build`), circuit compile and DEV setup,
  XDR golden generation, and Testnet end-to-end, smoke and browser e2e. They need an explicit decision about which tools a
  gate may assume.

### Referenced documents that do not exist

Source comments, tests or docs point at files that were not carried over: `NOTES.md`, `docs/poseidon-provenance.md`,
`docs/troubleshooting.md`, `docs/observability.md`, `contracts/README.md` and `contracts/BENCHMARKS.md`. Either write them or
remove the references.

### Verification that has not been done

- Testnet end-to-end, smoke and Playwright browser runs (they need a live network or a built app and were deliberately not run).
- `cargo audit` and `cargo deny` (not installed; the advisory-database fetch was not approved) and an `npm audit` re-check.
- No independent security audit of the contract, circuit or client.
- Mutation testing (the inherited Stryker setup was dropped).

### Release artifacts

The contract WASM (`contracts/target/wasm32v1-none/release/sure_circles.wasm`) is a local development build. It is not
committed; it should be attached to a release together with its hash and the toolchain versions recorded in
`docs/ARTIFACT_PROVENANCE.md`.

### Architecture policy versus `packages/core` depending on the Stellar SDK

- **Conflict:** `eslint.config.js` and `docs/architecture.md` say `packages/core` is pure crypto and must not import
  `@stellar/stellar-sdk`. In practice `packages/core/src/identity.ts` imports `StrKey` for `computeRecipientHash`, the
  package lists the SDK as a dependency (`docs/dependency-decisions.md`), and the recipient-hash fix tracked in issue #1
  will need the SDK's address XDR encoding as well.
- **Current handling:** one justified line-level `eslint-disable-next-line` on that import; the rule is otherwise intact.
- **Decision needed (maintainers):** either move address-aware code out of `core`, or relax the policy and the lint rule.
