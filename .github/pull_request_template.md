## What changed

<!-- One or two sentences. -->

## Why

<!-- Link the issue: Closes #... -->

## How it was tested

<!-- Tick what you actually ran. State anything you did NOT test. -->

- [ ] `npm run lint` and `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `cargo test` and `cargo deny check` in `contracts/` (required for contract changes)
- [ ] Circuit checks (required if `circuits/` changed)
- [ ] `npm run check:secrets` and `npm run check:stellar-sdk`
- [ ] Manual testing of the app (required for UI changes)
- [ ] Docs only; no code changed

## Security checklist

- [ ] No secrets, keys, `.env` files or generated cryptographic artifacts are included
- [ ] No new dependency, or its need and exact pin are explained above
- [ ] No install lifecycle hooks added to any manifest
- [ ] If circuit public signals, contract `public_inputs` or SDK encoding changed, all three sides were updated
- [ ] Negative tests added for security-relevant changes

## Screenshots

<!-- UI changes only; otherwise delete this section. -->
