# Attribution

Sure Circles is derived from **Sharibo**, an MIT-licensed project published by `crackedstudio`
(upstream repository `crackedstudio/sharibo`). The original copyright notice is retained unchanged in
[LICENSE](LICENSE) ("Copyright (c) 2026 Sharibo contributors"), as the MIT License requires. This project is
distributed under the same MIT License.

This file is provenance information, not a license term: the MIT License only requires that the copyright and
permission notice stay with copies and substantial portions of the software.

## What was inherited

The contract (`contracts/circles`), the circuit template (`circuits/`), the TypeScript packages
(`packages/core`, `packages/client`), the browser app (`app/`), the helper scripts (`scripts/`), the
test-vector generators, and the architecture documentation and ADRs. These have since been repaired and modified
for Sure Circles (see [CHANGELOG.md](CHANGELOG.md)).

## What was not inherited

Generated cryptographic material (verification and proving keys, setup transcripts, artifact hashes, proof
fixtures, XDR goldens), build outputs, test snapshots, the original deployment records and identifiers, CI
configuration, and the original lockfiles. Everything of that kind in this repository was generated here; see
[docs/ARTIFACT_PROVENANCE.md](docs/ARTIFACT_PROVENANCE.md).

## Source

The upstream repository was not reachable when this project was set up, so the source was taken from a local
working copy of upstream commit `5c46185e5f2b00fcf5ed3cb5fcf2fbc3ad63bad1` (branch `main`). That copy has not yet
been compared against the upstream repository; doing so when access is available would confirm it is faithful.

## Documentation references

Some ADRs mention issue numbers from the original project's tracker. Those links were removed; the numbers are
historical references only.
