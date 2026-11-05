/**
 * Manual mock for @sure-circles/client.
 *
 * The real package imports poseidon-bls12381 (WASM) and snarkjs (heavy
 * crypto) at module load time. Those are incompatible with a jsdom test
 * environment and require circuit artefact files that aren't present in CI.
 *
 * Tests that import this mock via `vi.mock('@sure-circles/client')` get lightweight
 * stub implementations instead, so the UI layer can be tested in isolation
 * without any crypto or Stellar RPC calls.
 *
 * HOW TO USE IN TESTS:
 *
 *   vi.mock('@sure-circles/client');
 *
 * Vitest will auto-resolve this file for any test that calls
 * `vi.mock('@sure-circles/client')` because it lives at
 * <root>/__mocks__/@sure-circles/client.ts, adjacent to the root node_modules
 * where the workspace symlink for @sure-circles/client lives.
 */

import { vi } from "vitest";
import type {
  Identity,
  ContractProof,
  ContractVerificationKey,
  SureCirclesNetworkConfig,
  SureCirclesClient,
  TxResult,
  CircleView,
  MerkleProof,
  CircleId,
  NullifierHash,
} from "@sure-circles/client";
// Import the helper from source, not from the mocked package: importing
// "@sure-circles/client" here would make this module wait on itself.
import { makeCircleId } from "../../packages/client/src/brand.js";

export const TREE_LEVELS = 4;
export const MAX_CIRCLE_SIZE = 2 ** TREE_LEVELS;

// ── Identity ──────────────────────────────────────────────────────────────────

export const FR_MODULUS = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;

const STROOPS_PER_XLM = 10_000_000n;

export function xlmToStroops(xlm: number | bigint | string): bigint {
  if (typeof xlm === "bigint") return xlm * STROOPS_PER_XLM;
  const value = typeof xlm === "number" ? xlm.toString() : xlm.trim();
  const negative = value.startsWith("-");
  const [wholePart, fractionalPart = ""] = value.replace(/^[+-]/, "").split(".");
  const whole = BigInt(wholePart || "0");
  const fraction = fractionalPart.padEnd(7, "0").slice(0, 7);
  let result = whole * STROOPS_PER_XLM + BigInt(fraction || "0");
  if (fractionalPart.length > 7 && fractionalPart[7]! >= "5") result += 1n;
  return negative ? -result : result;
}

export function stroopsToXlm(stroops: bigint): bigint {
  return stroops / STROOPS_PER_XLM;
}

export function formatXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;
  const whole = absolute / STROOPS_PER_XLM;
  const fraction = (absolute % STROOPS_PER_XLM).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function formatXlmDisplay(
  stroops: bigint,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;
  const whole = absolute / STROOPS_PER_XLM;
  const remainder = absolute % STROOPS_PER_XLM;
  const asNumber = Number(whole) + Number(remainder) / 1e7;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 7,
    ...options,
  }).format(negative ? -asNumber : asNumber);
}

export const DEFAULT_RETRY_POLICY = { maxRetries: 3, baseDelayMs: 500 };
export const POLL_RETRY_POLICY = { maxRetries: 1, baseDelayMs: 250 };
export const PATIENT_RETRY_POLICY = { maxRetries: 5, baseDelayMs: 750 };

export const randomFieldElement = vi.fn((): bigint => 42n);

export const poseidon = vi.fn((a: bigint, b: bigint): bigint => a ^ b);

export const generateIdentity = vi.fn((): Identity => ({
  identityNullifier: 1n,
  identitySecret: 2n,
  commitment: 3n,
}));

export const computeExternalNullifier = vi.fn(
  async (_circleId: bigint, _round: bigint): Promise<bigint> => 99n,
);

export const computeNullifierHash = vi.fn(
  (_identityNullifier: bigint, _externalNullifier: bigint): bigint => 77n,
);

// ── Merkle tree ───────────────────────────────────────────────────────────────

export const ZERO_VALUE = 0n;

export interface MerkleProofMock extends MerkleProof {}

/** Stub MerkleTree with fixed root and trivial proofs. */
export class MerkleTree {
  readonly levels: number;
  readonly root: bigint = 12345n;

  constructor(levels: number) {
    this.levels = levels;
  }

  static create(_levels: number, _leaves: bigint[]): MerkleTree {
    return new MerkleTree(_levels);
  }

  indexOf(_leaf: bigint): number {
    return 0;
  }

  proof(_leafIndex: number): MerkleProof {
    return {
      root: this.root,
      pathElements: Array(this.levels).fill(0n) as bigint[],
      pathIndices: Array(this.levels).fill(0) as number[],
    };
  }
}

// ── Proof / verify ────────────────────────────────────────────────────────────

export const verificationKeyToContractFormat = vi.fn((_vk: unknown): ContractVerificationKey => ({
  alpha: new Uint8Array(96),
  beta: new Uint8Array(192),
  gamma: new Uint8Array(192),
  delta: new Uint8Array(192),
  ic: [
    new Uint8Array(96),
    new Uint8Array(96),
    new Uint8Array(96),
    new Uint8Array(96),
    new Uint8Array(96),
  ],
}));

export const generateProof = vi.fn(async () => ({
  proof: {
    a: new Uint8Array(96),
    b: new Uint8Array(192),
    c: new Uint8Array(96),
  } as ContractProof,
  snarkjsProof: {
    pi_a: ["0", "0", "1"],
    pi_b: [
      ["0", "0"],
      ["0", "0"],
      ["1", "0"],
    ],
    pi_c: ["0", "0", "1"],
  },
  // [nullifierHash, root, externalNullifier, recipientHash] — see docs/wire-format.md
  publicSignals: ["77", "12345", "99", "55"],
  nullifierHash: 77n,
  root: 12345n,
  externalNullifier: 99n,
  provingTimeMs: 0,
}));

export const verifyProofLocally = vi.fn(async (): Promise<number> => 1);

export const estimateClaimFee = vi.fn(
  async (): Promise<import("@sure-circles/client").FeeEstimate | null> => ({
    minResourceFee: 500_000n,
    totalFee: 600_000n,
  }),
);

// ── Contract ──────────────────────────────────────────────────────────────────

export const connect = vi.fn(
  async (_config: SureCirclesNetworkConfig, _keypair: unknown): Promise<SureCirclesClient> =>
    ({}) as SureCirclesClient,
);

export const createCircle = vi.fn(
  async (_client: SureCirclesClient, _args: unknown): Promise<TxResult<CircleId>> => ({
    result: makeCircleId(37n),
    hash: "mockCreateHash",
  }),
);

export const fund = vi.fn(
  async (_client: SureCirclesClient, _args: unknown): Promise<TxResult<void>> => ({
    result: undefined,
    hash: "mockFundHash",
  }),
);

export const claim = vi.fn(
  async (_client: SureCirclesClient, _args: unknown): Promise<TxResult<void>> => ({
    result: undefined,
    hash: "mockClaimHash",
  }),
);

export const getCircle = vi.fn(
  async (_client: SureCirclesClient, _circleId: CircleId): Promise<CircleView> => ({
    admin: "MOCK_ADMIN",
    token: "MOCK_TOKEN",
    root: 12345n,
    contribution: 100_000_000n,
    size: 5,
    round: 0,
    pot: 0n,
    cancelled: false,
    fee_bps: 0,
    fee_recipient: "MOCK_FEE_RECIPIENT",
  }),
);

export const getVk = vi.fn(
  async (_client: SureCirclesClient, _circleId: bigint): Promise<ContractVerificationKey> => ({
    alpha: new Uint8Array(96),
    beta: new Uint8Array(192),
    gamma: new Uint8Array(192),
    delta: new Uint8Array(192),
    ic: [
    new Uint8Array(96),
    new Uint8Array(96),
    new Uint8Array(96),
    new Uint8Array(96),
    new Uint8Array(96),
  ],
  }),
);

export const cancelCircle = vi.fn(
  async (_client: SureCirclesClient, _args: unknown): Promise<TxResult<void>> => ({
    result: undefined,
    hash: "mockCancelHash",
  }),
);

export const getCircleCount = vi.fn(async (): Promise<bigint> => 1n);

export const getStatus = vi.fn(
  async (
    _client: SureCirclesClient,
    _circleId: CircleId,
  ): Promise<{ round: number; pot: bigint; target: bigint; cancelled: boolean }> => ({
    round: 0,
    pot: 0n,
    target: 500_000_000n,
    cancelled: false,
  }),
);

export const hasClaimed = vi.fn(
  async (
    _client: SureCirclesClient,
    _circleId: CircleId,
    _nullifierHash: NullifierHash,
  ): Promise<boolean> => false,
);

// ── SDK facade ────────────────────────────────────────────────────────────────
//
// Mirrors the real `SureCirclesSDK.connect(...)` interface. In tests the bound
// client is discarded; each method simply delegates to the stub free
// functions above so existing assertions on `connect`/`createCircle`/... keep
// working and interaction flows can be asserted through the facade too.

export class SureCirclesSDK {
  readonly networkConfig: SureCirclesNetworkConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly signer: any;
  readonly publicKey: string;
  readonly client: SureCirclesClient;

  private constructor(
    networkConfig: SureCirclesNetworkConfig,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: any,
    publicKey: string,
  ) {
    this.networkConfig = networkConfig;
    this.signer = signer;
    this.publicKey = publicKey;
    this.client = {} as SureCirclesClient;
  }

  static async connect(
    config: SureCirclesNetworkConfig,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keypairOrSigner: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _options?: any,
  ): Promise<SureCirclesSDK> {
    const publicKey =
      typeof keypairOrSigner?.publicKey === "function"
        ? keypairOrSigner.publicKey()
        : (keypairOrSigner?.publicKey ?? "MOCK_PUBLIC_KEY");
    return new SureCirclesSDK(config, keypairOrSigner, publicKey);
  }

  createCircle(args: unknown): Promise<TxResult<CircleId>> {
    return createCircle(this.client, args);
  }

  fund(args: unknown): Promise<TxResult<void>> {
    return fund(this.client, args);
  }

  claim(args: unknown): Promise<TxResult<void>> {
    return claim(this.client, args);
  }

  getCircle(circleId: CircleId): Promise<CircleView> {
    return getCircle(this.client, circleId);
  }

  getCircleCount(): Promise<bigint> {
    return getCircleCount();
  }

  getStatus(
    circleId: CircleId,
  ): Promise<{ round: number; pot: bigint; target: bigint; cancelled: boolean }> {
    return getStatus(this.client, circleId);
  }

  hasClaimed(circleId: CircleId, nullifierHash: NullifierHash): Promise<boolean> {
    return hasClaimed(this.client, circleId, nullifierHash);
  }
}

// ── Re-exports the UI layer needs (kept in sync with App.tsx's imports) ──────

export {
  ContractError,
  CircleNotFoundError,
  RoundNotFundedError,
  WrongRoundTagError,
  AlreadyClaimedError,
  InvalidProofError,
  RoundFullError,
  OverflowError,
  CircleCancelledError,
  InvalidRecipientError,
  RoundNotExpiredError,
  RpcError,
  ProvingError,
  InvalidInputError,
  describeError,
} from "../../packages/client/src/errors.js";

export { networkOf, NETWORKS } from "../../packages/client/src/networks.js";
export {
  makeCircleId,
  makeNullifierHash,
  makeExternalNullifier,
} from "../../packages/client/src/brand.js";
export type {
  CircleId,
  NullifierHash,
  ExternalNullifier,
} from "../../packages/client/src/brand.js";

// ── Artifact prefetch / event plumbing ───────────────────────────────────────
//
// The app subscribes to these on mount (ArtifactProgress calls
// subscribeToArtifactPrefetch / startArtifactPrefetch). Internal-only helpers
// (setArtifactOnEvent, prefetchMembershipArtifacts, getArtifactPrefetchProgress)
// live in __mocks__/@sure-circles/client/internal.ts, mirroring the package split. Without them in the
// manual mock the whole @sure-circles/client module throws on first use and App.tsx
// fails to load at all — the reason the app suite could not collect a single
// App test. Signatures mirror packages/client/src/{artifacts,prove}.ts.
import type { ArtifactPrefetchProgress } from "../../packages/client/src/artifacts.js";

const IDLE_PREFETCH: ArtifactPrefetchProgress = {
  status: "idle",
  loaded: 0,
  total: null,
  fraction: null,
};

export const configureArtifacts = vi.fn((_config: unknown): void => {});

/** Public entry point; resolves immediately in unit tests (no network). */
export const startArtifactPrefetch = vi.fn(async (_signal?: AbortSignal): Promise<unknown> => ({}));

export const subscribeToArtifactPrefetch = vi.fn(
  (listener: (progress: ArtifactPrefetchProgress) => void): (() => void) => {
    listener(IDLE_PREFETCH);
    return () => {};
  },
);

/** Resolves immediately with empty artifact paths — no wasm/zkey in unit tests. */
export const getArtifacts = vi.fn(async (_signal?: AbortSignal): Promise<unknown> => ({}));

/** Read-only client stub — the UI only ever passes it back into other stubs. */
export async function connectReadOnly(_config: unknown): Promise<unknown> {
  return {};
}
