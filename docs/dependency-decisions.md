# Dependency decisions

This records why each version was chosen when the manifests were rewritten. Nothing has been installed:
these pins were checked against the public npm registry's metadata (existence, `engines`, peer
dependencies, install scripts) but not against a resolved, audited lockfile. A lockfile must be generated
later in an isolated environment with lifecycle scripts disabled and then reviewed.

## Rules applied

1. **Exact pins** for every dependency (no `^`, `~`, `*`), so the reviewed version is the installed version.
2. **No install lifecycle hooks** (`preinstall`, `install`, `postinstall`, `prepare`) in any manifest. The
   upstream `prepare` hook in `packages/core` was removed; packages are built by explicit scripts.
3. **No wildcard internal versions.** Internal packages are pinned to the workspace version (`0.0.0`).
4. **Start from what upstream declared; do not take "latest".** Where upstream declared conflicting
   versions, the set that is mutually compatible and satisfies `.nvmrc` was kept.
5. **Only dependencies actually imported or invoked by active source** were kept.
6. **One version per tool** across all workspaces.

## Decisions

| Area | Chosen | Alternatives declared upstream | Reason |
| --- | --- | --- | --- |
| Node.js | `^22.13.0` (`.nvmrc`: `22`) | `.nvmrc` 20 | `@stellar/stellar-sdk` 16.2.0 and 17.2.0 require Node >= 22.0 / >= 22.12; `@testing-library/jest-dom` 7.0.0 requires >= 22; ESLint 10.11.0 requires `^22.13.0`; `scripts/smoke.ts` uses `process.loadEnvFile` (Node >= 21.7). Node 20 could not run the stack. |
| `@stellar/stellar-sdk` | `17.2.0`, plus a root `overrides` pin | `^16.2.0` (core dev), `^17.2.0` (app, client, scripts) | Majority and newest in use; `scripts/maintenance/check-stellar-sdk-version.mjs` requires one identical range in `app`, `packages/client`, `packages/core` and `scripts`. `packages/core` imports `StrKey` at runtime, so it is a dependency there, not a dev dependency. |
| TypeScript | `6.0.3` | `7.0.2`, `6.0.3` | `typescript-eslint@8.71.0` supports TypeScript `< 6.1`; 7.x is outside that range. |
| Vite | `8.3.5` | `8.3.1`, `8.1.3` | Raised from 8.1.3 (Phase 6C) because `npm audit` reported dev-server advisories for 8.0.0 to 8.1.5 (GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22 and three `launch-editor` advisories). 8.3.5 is the patched release and keeps the 8.x line, so `@vitejs/plugin-react` 6.0.3 (peer `vite@^8`) is unaffected. |
| Vitest and `@vitest/coverage-v8` | `4.1.12` | `5.0.2`, `4.1.10`, `^2.1.8` | Vitest 5 requires Node `^22.12` and conflicts with an older Vite family; 4.1.12 supports Vite 8 and `^22`. Raised from 4.1.10 (Phase 6C) for GHSA-82fw-gwwq-j7x9 and GHSA-qxg6-89mg-rqv8 in `@vitest/mocker` (affected <= 4.1.11). `@vitest/coverage-v8` is added because the configs use the `v8` provider and the upstream manifests omitted it; it must equal the Vitest version. |
| `@vitejs/plugin-react` | `6.0.3` | `6.1.1`, `6.0.3` | Peer: `vite@^8`. Kept with Vite 8.3.5. |
| jsdom | `26.1.0` | `30.1.1`, `26.1.0` | jsdom 30 requires Node `^22.22.2`, stricter than the project baseline. |
| React, React DOM | `19.3.0` | pinned upstream | Unchanged. `@types/react` and `@types/react-dom` `19.3.0` match. |
| `@types/node` | `22.20.4` | `24.13.3`, `26.6.3` | Types should match the Node runtime major (22). |
| Testing Library | react `16.3.2`, dom `10.4.0`, jest-dom `7.0.0`, user-event `14.6.7` | caret ranges | Pinned to the base of upstream's ranges. `@testing-library/dom` is a required peer of the React package. |
| `vitest-axe`, Playwright | `0.1.0`, `1.63.0` | unchanged | `axe-core` was dropped as a direct dependency: `vitest-axe` already depends on it. |
| `rollup-plugin-visualizer` | `5.14.0` | `^5.14.0` | Optional bundle analysis only. |
| ESLint family | eslint `10.11.0`, `typescript-eslint` `8.71.0`, `eslint-config-prettier` `10.1.8`, `eslint-plugin-react-hooks` `7.1.1`, `globals` `17.11.0` | caret ranges | `@typescript-eslint/eslint-plugin` and `/parser` were dropped: `eslint.config.js` imports only the `typescript-eslint` umbrella package. |
| Prettier, knip, tsx | `3.9.9`, `6.38.0`, `4.23.15` | unchanged | Unchanged. |
| Circuit tooling | snarkjs `0.7.6`, `poseidon-bls12381` `1.0.2`, `poseidon-bls12381-circom` `1.0.0`, `circom_tester` `0.0.24`, mocha `12.0.2`, chai `6.2.2` | `poseidon-bls12381` was `^1.0.0` in test-vectors | Poseidon packages must stay in lock-step (`circuits/scripts/check-poseidon-constants.mjs` enforces it). |
| Test helpers | `fast-check` `4.10.2`, `@types/snarkjs` `0.7.9` | unchanged | Used by `core` and `client` tests. |

## Removed

`@stryker-mutator/*` (mutation testing; its config was not migrated), `@typescript-eslint/eslint-plugin`
and `/parser`, `buffer` (not imported by source; Freighter brings its own), `axe-core` (transitive),
`@sharibo/client` wildcard references.

## Resolver and lockfile

- **npm 10.9.3 cannot resolve this tree.** It crashes in Arborist (`#loadPeerSet`, "Cannot read properties of null
  (reading 'edgesOut')") for any `vitest` from 4.1.0 up, including a manifest that contains only `vitest`. Versions
  up to 4.0.18 resolve. Vitest 4.1.0 added a required `vite` peer, and the optional-peer chain through
  `@vitejs/devtools` and `vitest@*` triggers the bug. It is not a manifest conflict.
- **npm 11.21.1 resolves it correctly** (Node 22.20.0). `package-lock.json` was generated with
  `npm install --package-lock-only --ignore-scripts` under npm 11.21.1. Use the same npm for `npm ci`.
- The lockfile contains a single Vite (8.3.5) and no `@vitest/browser-*` or `@vitejs/devtools*` packages.
- **`underscore` override (root `package.json`, `overrides`):** `"underscore": "1.13.8"`. Chain:
  `snarkjs 0.7.6 -> bfj 7.1.0 -> jsonpath 1.3.0 -> underscore`. Advisory GHSA-qpx9-hpmf-5gmw (unbounded
  recursion in `_.flatten` / `_.isEqual`, affects <= 1.13.7). `jsonpath@1.3.0` pins `underscore` to exactly
  `1.13.6` and has no newer release, and `snarkjs` 0.7.6 is already the latest, so the patched version can only be
  selected with an override. Compatibility with 1.13.8 was reviewed by source inspection: `jsonpath` imports only
  `underscore.uniq`, and `uniq` and everything it imports are byte-identical between 1.13.6 and 1.13.8; the
  differences are in `isEqual` / `isDataView` handling and the version string. No direct project dependency was
  upgraded for this remediation.
- **Not changed:** the remaining `npm audit` findings (18 moderate, see CHANGELOG) are glob/minimatch chains
  through dev tooling (`mocha`, ESLint stack, `knip`) and `filelist -> jake -> ejs` under `snarkjs` /
  `circom_tester`. They need a separate decision.
- npm does not re-resolve an already-locked package when an override is added to an existing lockfile. The
  override was applied with `npm update underscore --package-lock-only --ignore-scripts`, which changed only the
  `underscore` entry (1.13.6 to 1.13.8).

## Planned trusted-setup toolchain (not installed, not run)

Decided in Phase 8A.1 for the trusted-setup phase. Nothing below has been installed or executed.

- **Circom 2.2.3**, matching `circuits/config.json` (`circomVersion`). Source of truth is the upstream
  `iden3/circom` project: a release tag or a source build, with the release checksum or tag commit recorded
  before first use. No binary from any inherited workspace may be used. As of 2026-11-05 no Circom binary is
  present on `C:`.
- **snarkjs 0.7.6**, the exact version already pinned in `circuits/package.json` and the lockfile. It is run from
  the installed npm package. No inherited snarkjs scripts or binaries may be copied in.
- The circuit tests also need `circom_tester` 0.0.24 (already pinned), which calls the `circom` binary.
- The circuits package currently has no compile or setup scripts. They are written in the setup phase.

## Open items

- Registry metadata is not proof of safety. Review the generated lockfile, install-script behaviour of
  transitive dependencies, and run `npm audit` and an advisory check in the isolated environment.
- `@stellar/freighter-api` 6.0.1 has no declared peer on a specific SDK version; compatibility with SDK 17.2.0
  has not been tested.
- The Rust dependency set is whatever `contracts/Cargo.lock` records; audit it with `cargo deny` and
  `cargo audit`.
