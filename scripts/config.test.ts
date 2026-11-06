import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { validate, loadConfig } from "./config.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let fixtureDir: string;
let envPath: string;

beforeEach(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), "sure-circles-config-test-"));
  envPath = path.join(fixtureDir, ".env");
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

function writeEnv(content: string) {
  writeFileSync(envPath, content, "utf8");
}

// Keys the config loader reads. They are stripped from the child's environment so an ambient
// real value on the developer's machine can never override the fixture file.
const CONFIG_ENV_KEYS = [
  "STELLAR_RPC_URL",
  "STELLAR_HORIZON_URL",
  "STELLAR_NETWORK_PASSPHRASE",
  "TEST_TOKEN_CONTRACT_ID",
  "SURE_CIRCLES_CONTRACT_ID",
  "ADMIN_SECRET_KEY",
];

function hermeticChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, SURE_CIRCLES_ENV_FILE: envPath };
  for (const key of CONFIG_ENV_KEYS) delete env[key];
  return env;
}

/**
 * Run config.ts in a child process against a throwaway env file.
 * `mode: "import"` only imports the module; `mode: "get"` also calls getConfig().
 */
async function configSubprocess(
  envContent: string,
  mode: "import" | "get",
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  writeEnv(envContent);
  const script = `
    import path from 'node:path';
    import { fileURLToPath, pathToFileURL } from 'node:url';
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const configUrl = pathToFileURL(path.join(__dirname, 'config.ts')).href;
    try {
      const mod = await import(configUrl);
      console.log('IMPORTED');
      if (${JSON.stringify(mode)} === 'get') mod.getConfig();
      console.log('CONFIG_LOADED');
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  `;
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx/esm", "--eval", script],
      { cwd: __dirname, timeout: 20_000, env: hermeticChildEnv() },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.code || 1 };
  }
}

describe("config loader", () => {
  const validEnvRecord: Record<string, string> = {
    STELLAR_RPC_URL: "https://rpc.invalid",
    STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    TEST_TOKEN_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4",
    SURE_CIRCLES_CONTRACT_ID: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBN7DY",
    ADMIN_SECRET_KEY: "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABGVV",
  };

  it("loads successfully with all valid values", () => {
    const { config, errors } = validate(validEnvRecord);
    assert.deepEqual(errors, []);
    assert.ok(config);
  });

  it("fails when STELLAR_RPC_URL is missing", () => {
    const { errors } = validate({ ...validEnvRecord, STELLAR_RPC_URL: undefined });
    assert.match(errors[0] ?? "", /STELLAR_RPC_URL.*missing or empty/);
  });

  it("fails when STELLAR_RPC_URL is empty", () => {
    const { errors } = validate({ ...validEnvRecord, STELLAR_RPC_URL: "   " });
    assert.match(errors[0] ?? "", /STELLAR_RPC_URL.*missing or empty/);
  });

  it("fails when STELLAR_RPC_URL is malformed", () => {
    const { errors } = validate({ ...validEnvRecord, STELLAR_RPC_URL: "notaurl" });
    assert.match(errors[0] ?? "", /STELLAR_RPC_URL.*not a valid HTTP\(S\) URL/);
  });

  it("fails when STELLAR_NETWORK_PASSPHRASE is missing", () => {
    const { errors } = validate({ ...validEnvRecord, STELLAR_NETWORK_PASSPHRASE: undefined });
    assert.match(errors[0] ?? "", /STELLAR_NETWORK_PASSPHRASE.*missing or empty/);
  });

  it("fails when STELLAR_NETWORK_PASSPHRASE is empty", () => {
    const { errors } = validate({ ...validEnvRecord, STELLAR_NETWORK_PASSPHRASE: "" });
    assert.match(errors[0] ?? "", /STELLAR_NETWORK_PASSPHRASE.*missing or empty/);
  });

  it("fails when STELLAR_NETWORK_PASSPHRASE is whitespace only", () => {
    const { errors } = validate({ ...validEnvRecord, STELLAR_NETWORK_PASSPHRASE: "   \t" });
    assert.match(errors[0] ?? "", /STELLAR_NETWORK_PASSPHRASE.*missing or empty/);
  });

  it("fails when TEST_TOKEN_CONTRACT_ID is missing", () => {
    const { errors } = validate({ ...validEnvRecord, TEST_TOKEN_CONTRACT_ID: undefined });
    assert.match(errors[0] ?? "", /TEST_TOKEN_CONTRACT_ID.*missing or empty/);
  });

  it("fails when TEST_TOKEN_CONTRACT_ID is empty", () => {
    const { errors } = validate({ ...validEnvRecord, TEST_TOKEN_CONTRACT_ID: "" });
    assert.match(errors[0] ?? "", /TEST_TOKEN_CONTRACT_ID.*missing or empty/);
  });

  it("fails when TEST_TOKEN_CONTRACT_ID is whitespace only", () => {
    const { errors } = validate({ ...validEnvRecord, TEST_TOKEN_CONTRACT_ID: "   " });
    assert.match(errors[0] ?? "", /TEST_TOKEN_CONTRACT_ID.*missing or empty/);
  });

  it("fails when TEST_TOKEN_CONTRACT_ID is malformed (wrong prefix)", () => {
    const { errors } = validate({
      ...validEnvRecord,
      TEST_TOKEN_CONTRACT_ID: "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABGVV",
    });
    assert.match(
      errors[0] ?? "",
      /TEST_TOKEN_CONTRACT_ID.*not a valid Stellar contract ID.*should start with 'C'/,
    );
  });

  it("fails when TEST_TOKEN_CONTRACT_ID is malformed (wrong length)", () => {
    const { errors } = validate({ ...validEnvRecord, TEST_TOKEN_CONTRACT_ID: "C123" });
    assert.match(
      errors[0] ?? "",
      /TEST_TOKEN_CONTRACT_ID.*not a valid Stellar contract ID.*56 characters/,
    );
  });

  it("fails when SURE_CIRCLES_CONTRACT_ID is missing", () => {
    const { errors } = validate({ ...validEnvRecord, SURE_CIRCLES_CONTRACT_ID: undefined });
    assert.match(errors[0] ?? "", /SURE_CIRCLES_CONTRACT_ID.*missing or empty/);
  });

  it("fails when SURE_CIRCLES_CONTRACT_ID is empty", () => {
    const { errors } = validate({ ...validEnvRecord, SURE_CIRCLES_CONTRACT_ID: "" });
    assert.match(errors[0] ?? "", /SURE_CIRCLES_CONTRACT_ID.*missing or empty/);
  });

  it("fails when SURE_CIRCLES_CONTRACT_ID is malformed (wrong prefix)", () => {
    const { errors } = validate({
      ...validEnvRecord,
      SURE_CIRCLES_CONTRACT_ID: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABGVV",
    });
    assert.match(
      errors[0] ?? "",
      /SURE_CIRCLES_CONTRACT_ID.*not a valid Stellar contract ID.*should start with 'C'/,
    );
  });

  it("fails when SURE_CIRCLES_CONTRACT_ID is malformed (wrong length)", () => {
    const { errors } = validate({ ...validEnvRecord, SURE_CIRCLES_CONTRACT_ID: "CSHORT" });
    assert.match(
      errors[0] ?? "",
      /SURE_CIRCLES_CONTRACT_ID.*not a valid Stellar contract ID.*56 characters/,
    );
  });

  it("fails when ADMIN_SECRET_KEY is missing", () => {
    const { errors } = validate({ ...validEnvRecord, ADMIN_SECRET_KEY: undefined });
    assert.match(errors[0] ?? "", /ADMIN_SECRET_KEY.*missing or empty/);
  });

  it("fails when ADMIN_SECRET_KEY is empty", () => {
    const { errors } = validate({ ...validEnvRecord, ADMIN_SECRET_KEY: "" });
    assert.match(errors[0] ?? "", /ADMIN_SECRET_KEY.*missing or empty/);
  });

  it("validates ADMIN_SECRET_KEY starts with 'S' (not 'G' or 'C')", () => {
    const { errors } = validate({
      ...validEnvRecord,
      ADMIN_SECRET_KEY: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABGVV",
    });
    assert.match(
      errors[0] ?? "",
      /ADMIN_SECRET_KEY.*not a valid Stellar secret key.*should start with 'S'/,
    );
  });

  it("validates ADMIN_SECRET_KEY is 56 characters long", () => {
    const { errors } = validate({ ...validEnvRecord, ADMIN_SECRET_KEY: "SSHORT" });
    assert.match(
      errors[0] ?? "",
      /ADMIN_SECRET_KEY.*not a valid Stellar secret key.*56 characters/,
    );
  });

  it("CRITICAL: secret key never appears in error message when missing", () => {
    const { errors } = validate({ ...validEnvRecord, ADMIN_SECRET_KEY: undefined });
    const stderr = errors.join("\n");
    assert.match(stderr, /ADMIN_SECRET_KEY/);
    const secretValue = "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABGVV";
    assert.doesNotMatch(stderr, new RegExp(secretValue.slice(0, 20)));
  });

  it("CRITICAL: secret key never appears in error message when malformed", () => {
    const secretValue = "SMALFORMEDKEY12345678901234567890123456789012345678";
    const { errors } = validate({ ...validEnvRecord, ADMIN_SECRET_KEY: secretValue });
    const stderr = errors.join("\n");
    assert.match(stderr, /ADMIN_SECRET_KEY/);
    assert.doesNotMatch(stderr, new RegExp(secretValue));
  });

  it("CRITICAL: contract IDs appear in error messages but secrets do not", () => {
    const contractId = "CBADCONTRACTID00000000000000000000000000000000000000";
    const secretKey = "SSECRETKEYSHOULDBEHIDDEN0000000000000000000000000000";
    const { errors } = validate({
      ...validEnvRecord,
      TEST_TOKEN_CONTRACT_ID: contractId,
      ADMIN_SECRET_KEY: secretKey,
    });
    const stderr = errors.join("\n");
    assert.match(stderr, new RegExp(contractId));
    assert.doesNotMatch(stderr, new RegExp(secretKey));
  });

  it("aggregates multiple errors into one message", () => {
    const { errors } = validate({
      STELLAR_RPC_URL: "notaurl",
      STELLAR_NETWORK_PASSPHRASE: "",
      TEST_TOKEN_CONTRACT_ID: "BADID",
      SURE_CIRCLES_CONTRACT_ID: undefined,
      ADMIN_SECRET_KEY: "GNOTASECRET0000000000000000000000000000000000000000",
    });
    assert.equal(errors.length, 5);
    const stderr = errors.join("\n");
    assert.match(stderr, /STELLAR_RPC_URL/);
    assert.match(stderr, /STELLAR_NETWORK_PASSPHRASE/);
    assert.match(stderr, /TEST_TOKEN_CONTRACT_ID/);
    assert.match(stderr, /SURE_CIRCLES_CONTRACT_ID/);
    assert.match(stderr, /ADMIN_SECRET_KEY/);
  });

  it("importing the module has no side effects, even with a broken env", async () => {
    const { stdout, stderr, exitCode } = await configSubprocess("", "import");
    assert.equal(exitCode, 0, stderr);
    assert.match(stdout, /IMPORTED/);
    assert.match(stdout, /CONFIG_LOADED/);
  });

  it("real behaviour: getConfig() with a broken env throws one aggregated error", async () => {
    const { stderr, exitCode } = await configSubprocess("", "get");
    assert.equal(exitCode, 1);
    assert.match(stderr, /Environment validation failed/);
    assert.match(stderr, /\.env\.example/);
    assert.match(stderr, /scripts\/config\.ts/);
    assert.match(stderr, /5 variable/);
  });

  it("getConfig() reads the env file when the process environment is empty", async () => {
    const lines = Object.entries(validEnvRecord).map(([k, v]) => `${k}=${v}`);
    const { stdout, stderr, exitCode } = await configSubprocess(lines.join("\n"), "get");
    assert.equal(exitCode, 0, stderr);
    assert.match(stdout, /CONFIG_LOADED/);
  });

  it("loadConfig(env) validates the given record only", () => {
    const config = loadConfig(validEnvRecord);
    assert.equal(config.stellarRpcUrl, validEnvRecord.STELLAR_RPC_URL);
    assert.throws(() => loadConfig({}), /Environment validation failed/);
  });

  it("loading an env file does not write into process.env", () => {
    const before = { ...process.env };
    const lines = Object.entries(validEnvRecord).map(([k, v]) => `${k}=${v}`);
    writeEnv(lines.join("\n"));
    const saved = process.env.SURE_CIRCLES_ENV_FILE;
    process.env.SURE_CIRCLES_ENV_FILE = envPath;
    try {
      for (const key of CONFIG_ENV_KEYS) delete process.env[key];
      loadConfig();
      for (const key of CONFIG_ENV_KEYS) {
        assert.equal(process.env[key], undefined, `${key} leaked into process.env`);
      }
    } finally {
      if (saved === undefined) delete process.env.SURE_CIRCLES_ENV_FILE;
      else process.env.SURE_CIRCLES_ENV_FILE = saved;
      for (const key of CONFIG_ENV_KEYS) {
        if (before[key] !== undefined) process.env[key] = before[key];
      }
    }
  });
});
