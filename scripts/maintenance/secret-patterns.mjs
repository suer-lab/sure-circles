/**
 * Shared Stellar secret / sensitive-value patterns.
 *
 * Single source of truth for:
 * - `scripts/maintenance/check-secrets.mjs` (pre-commit guard)
 * - `app/src/lib/debugBundle.ts` (defence-in-depth redaction)
 *
 * Keep one definition so a regex fix lands in both places.
 * This module is plain ESM so both Node `.mjs` scripts and the Vite app
 * can import it without a build step.
 */

/** Stellar secret seed: S + 55 chars from base-32 alphabet [A-Z2-7] (56 total). */
export const STELLAR_SECRET_KEY_PATTERN = /\bS[A-Z2-7]{55}\b/g;

/**
 * Debug-bundle variant of the secret-seed pattern. Case-insensitive, so a seed that was
 * lowercased by a log formatter or error message is still caught. The pre-commit scanner keeps
 * the strict uppercase pattern above (it must not flag arbitrary lowercase words).
 */
export const REDACT_STELLAR_SECRET_PATTERN = /\bS[A-Z2-7]{55}\b/gi;

/**
 * Large decimal integer (>= 76 digits): a field-element sized scalar
 * (identityNullifier / identitySecret). BLS12-381 scalars are up to 77 digits, and a
 * scalar below 10^76 prints with only 76, so the floor is 76. Used by the debug bundle
 * redactor; the pre-commit hook only scans for Stellar secret keys.
 */
export const FIELD_ELEMENT_SCALAR_PATTERN = /\b\d{76,}\b/g;

/**
 * 0x-prefixed 64-hex-digit field element (a scalar rendered as hex).
 * A bare 64-hex value is a transaction hash and is deliberately NOT matched.
 */
export const HEX_FIELD_ELEMENT_PATTERN = /\b0x[0-9a-fA-F]{64}\b/g;

/** Muxed account Strkey: M + 68 base-32 chars (69 total); it embeds an account id. */
export const MUXED_ACCOUNT_PATTERN = /\bM[A-Z2-7]{68}\b/g;

/**
 * Patterns that must never appear in a debug bundle.
 * Order is relied on by tests: [0] seed, [1] decimal scalar.
 */
export const REDACT_PATTERNS = [
  REDACT_STELLAR_SECRET_PATTERN,
  FIELD_ELEMENT_SCALAR_PATTERN,
  HEX_FIELD_ELEMENT_PATTERN,
  MUXED_ACCOUNT_PATTERN,
];

/** Pattern used by the pre-commit secret scanner (secret keys only, strict uppercase). */
export const COMMIT_SECRET_PATTERNS = [STELLAR_SECRET_KEY_PATTERN];
