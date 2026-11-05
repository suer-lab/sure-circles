# Publication checklist

Things that must be settled before and right after the repository is published. Items are removed from this file as
they are completed.

## Before the repository is created

- [ ] **Second security reviewer.** `.github/CODEOWNERS` lists only the confirmed maintainer. Add a second, independent
      reviewer for the security-critical paths (contracts, circuits, `packages/core`, `prove.ts`, `.github`) when one is
      confirmed.

## Quality gates that fail today (CI does not run them yet)

- [ ] **ESLint:** about 90 errors and 10 warnings, mostly inherited `no-explicit-any`. Fix without adding suppressions.
- [ ] **Prettier:** the format check fails on many files, including generated JSON and markdown. Decide which generated
      files to exclude via `.prettierignore`, then format the rest.
- [ ] **ADR numbering:** `docs/adr/` has two ADRs numbered `005`, which `npm run check:adrs` rejects.

## Right after the repository is created

- [ ] Enable **private vulnerability reporting** (Settings, Code security).
- [ ] Protect `main` with a ruleset: pull request required, at least one approval, Code Owner review, the CI jobs
      (`typescript`, `core`, `contract`, `static`) as required checks, no force pushes, no branch deletion.
- [ ] Choose a merge strategy (squash is recommended for a small team).
- [ ] Keep Issues on; leave Wiki off; Discussions are optional.
- [ ] Watch the first CI run on GitHub-hosted runners and fix platform differences.
- [ ] Do **not** create a `v0.1.0` tag or release yet.
- [ ] When release assets are published, label them DEVELOPMENT-ONLY and include the SHA-256 values recorded in
      [ARTIFACT_PROVENANCE.md](ARTIFACT_PROVENANCE.md).
