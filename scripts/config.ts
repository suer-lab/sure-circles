import { NETWORKS } from "@sure-circles/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Exported typed configuration loaded from the repo-root .env file.
 *
 * Every required variable is validated **before** any network call so that
 * a missing or malformed value surfaces as a single aggregated error with
 * _all_ problems listed at once, pointing at `.env.example`.
 */
export interface ScriptConfig {
  stellarRpcUrl: string;
  stellarNetworkPassphrase: string;
  testTokenContractId: string;
  sureCirclesContractId: string;
  adminSecretKey: string;
}

// ---- Helpers ----

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Which env file to read. Defaults to the repo-root `.env`.
 *
 * `SURE_CIRCLES_ENV_FILE` exists so the test suite can point at a throwaway fixture
 * instead of mutating (and racing on) the developer's real `.env` — two test
 * files writing the same path concurrently is exactly the kind of shared
 * mutable state that makes a suite non-hermetic and unrunnable in parallel.
 * Unset in normal use, so behaviour is unchanged.
 */
function envFilePath(): string {
  return process.env.SURE_CIRCLES_ENV_FILE || path.join(repoRoot, ".env");
}

/**
 * Parse the env file into a plain record. Pure with respect to `process.env`: nothing is
 * written to it, so loading a fixture in one test cannot leak values into the next test or
 * into a child process.
 */
function readEnvFile(): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    const content = readFileSync(envFilePath(), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key) continue;
      let value = trimmed.slice(eq + 1).trim();
      // Strip optional surrounding quotes.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
  } catch {
    // .env file missing — the process environment alone is validated.
  }
  return values;
}

/**
 * The effective environment: the env file's values, overridden by real environment variables
 * (environment variables take precedence, as before). Returns a new object; `process.env`
 * is not modified.
 */
function loadEnv(): Record<string, string | undefined> {
  return { ...readEnvFile(), ...process.env };
}

function isNonEmpty(s: string | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function isValidUrl(s: string): boolean {
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Stellar StrKey validation — checks the expected prefix character and length.
 * For contract IDs the prefix is 'C', for secret keys it's 'S'.
 */
function isValidStrKey(s: string, expectedPrefix: "C" | "S"): boolean {
  return s.length === 56 && s.startsWith(expectedPrefix);
}

interface ValidationRule {
  key: string;
  label: string;
  validate: (value: string | undefined) => string | null; // null = ok, string = error msg
}

const rules: ValidationRule[] = [
  {
    key: "STELLAR_RPC_URL",
    label: "STELLAR_RPC_URL",
    validate: (v) => {
      // A missing/blank RPC URL must fail loudly rather than silently
      // falling through to the `NETWORKS.testnet.rpcUrl` default below —
      // running a whole e2e round against the wrong network because someone
      // left the variable blank is exactly the class of bug this validator
      // exists to prevent.
      if (!isNonEmpty(v)) return "is missing or empty";
      if (!isValidUrl(v)) return `"${v}" is not a valid HTTP(S) URL`;
      return null;
    },
  },
  {
    key: "STELLAR_NETWORK_PASSPHRASE",
    label: "STELLAR_NETWORK_PASSPHRASE",
    // Any non-empty value is accepted (no shape check): the passphrase is
    // network-specific and can legitimately change, so only presence is
    // validated. As with STELLAR_RPC_URL, blank must not silently fall back
    // to the testnet default.
    validate: (v) => (isNonEmpty(v) ? null : "is missing or empty"),
  },
  {
    key: "TEST_TOKEN_CONTRACT_ID",
    label: "TEST_TOKEN_CONTRACT_ID",
    validate: (v) => {
      if (!isNonEmpty(v)) return "is missing or empty";
      if (!isValidStrKey(v, "C"))
        return `"${v}" is not a valid Stellar contract ID (should start with 'C' and be 56 characters)`;
      return null;
    },
  },
  {
    key: "SURE_CIRCLES_CONTRACT_ID",
    label: "SURE_CIRCLES_CONTRACT_ID",
    validate: (v) => {
      if (!isNonEmpty(v)) return "is missing or empty";
      if (!isValidStrKey(v, "C"))
        return `"${v}" is not a valid Stellar contract ID (should start with 'C' and be 56 characters)`;
      return null;
    },
  },
  {
    key: "ADMIN_SECRET_KEY",
    label: "ADMIN_SECRET_KEY",
    validate: (v) => {
      if (!isNonEmpty(v)) return "is missing or empty";
      if (!isValidStrKey(v, "S"))
        return "is not a valid Stellar secret key (should start with 'S' and be 56 characters)";
      return null;
    },
  },
];

// ---- Load & validate ----

export function validate(env: Record<string, string | undefined>) {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = env[rule.key];
    const err = rule.validate(value);
    if (err !== null) {
      errors.push(`  - ${rule.label}: ${err}`);
    }
  }

  if (errors.length > 0) {
    return { config: null, errors };
  }

  return {
    config: {
      stellarRpcUrl: env.STELLAR_RPC_URL || NETWORKS.testnet.rpcUrl,
      stellarNetworkPassphrase: env.STELLAR_NETWORK_PASSPHRASE || NETWORKS.testnet.passphrase,
      testTokenContractId: env.TEST_TOKEN_CONTRACT_ID!,
      sureCirclesContractId: env.SURE_CIRCLES_CONTRACT_ID!,
      adminSecretKey: env.ADMIN_SECRET_KEY!,
    } as ScriptConfig,
    errors: [],
  };
}

/**
 * Load and validate the configuration. Throws one aggregated error listing every problem.
 *
 * With no argument it reads the env file plus the process environment. Pass an explicit
 * `env` record to validate that record only (no file or process access), which is how tests
 * and callers with their own environment should use it.
 */
export function loadConfig(env?: Record<string, string | undefined>): ScriptConfig {
  const { config, errors } = validate(env ?? loadEnv());

  if (errors.length > 0) {
    const aggregated = [
      `Environment validation failed for ${errors.length} variable(s):`,
      ...errors,
      "",
      "Fill in the missing values in .env (copy from .env.example) and try again.",
      "See scripts/config.ts for the full list of required variables and their expected formats.",
    ].join("\n");
    throw new Error(aggregated);
  }

  return config!;
}

let cached: ScriptConfig | undefined;

/**
 * The validated configuration, loaded lazily on first call and memoised. Importing this module
 * has no side effects: nothing is read or validated until a caller asks for the config.
 */
export function getConfig(): ScriptConfig {
  cached ??= loadConfig();
  return cached;
}

/** Forget the memoised configuration (for tests). */
export function resetConfigCache(): void {
  cached = undefined;
}
