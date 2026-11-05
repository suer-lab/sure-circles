// Type declarations for secret-patterns.mjs (plain JavaScript shared by the app and the
// maintenance scripts). Kept next to the module so TypeScript consumers get real types.
export const STELLAR_SECRET_KEY_PATTERN: RegExp;
export const REDACT_STELLAR_SECRET_PATTERN: RegExp;
export const FIELD_ELEMENT_SCALAR_PATTERN: RegExp;
export const HEX_FIELD_ELEMENT_PATTERN: RegExp;
export const MUXED_ACCOUNT_PATTERN: RegExp;
export const REDACT_PATTERNS: readonly RegExp[];
export const COMMIT_SECRET_PATTERNS: readonly RegExp[];
