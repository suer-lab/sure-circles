# Artifact verifier fixtures

Tiny synthetic files for `verify-artifacts.mjs` failure-path tests. They are not keys, proofs or setup
material; the JSON is a placeholder. Each directory sets up one case: `valid`, `tampered` (file changed
after hashing), `mismatch-hash` (hash of other content), `missing-hash`, `malformed-hash`, `empty-hash`.
