import {
  connect,
  resolveSigner,
  createCircle,
  fund,
  claim,
  getCircle,
  getVk,
  getCircleCount,
  getStatus,
  hasClaimed,
  type SureCirclesNetworkConfig,
  type SureCirclesClient,
  type SureCirclesSigner,
  type CircleView,
  type TxResult,
} from "./contract.js";
import { Keypair } from "@stellar/stellar-sdk";
import type { ContractProof, ContractVerificationKey } from "./prove.js";
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from "./retry.js";
import type { CircleId, NullifierHash, ExternalNullifier } from "./brand.js";

export interface SureCirclesSDKOptions {
  /**
   * Default retry policy for every contract call made through this instance.
   * Individual methods accept an optional per-call override that takes precedence.
   */
  retryPolicy?: RetryPolicy;
}

export interface CreateCircleArgs {
  admin: string;
  token: string;
  root: bigint;
  contribution: bigint;
  size: number;
  vk: ContractVerificationKey;
  /** Protocol fee in basis points (0-10_000; 0 = no fee). */
  feeBps: number;
  /** Address the protocol fee is paid to (required when feeBps > 0). */
  feeRecipient: string;
}

export interface FundArgs {
  circleId: CircleId;
  from: string;
}

export interface ClaimArgs {
  circleId: CircleId;
  recipient: string;
  nullifierHash: NullifierHash;
  externalNullifier: ExternalNullifier;
  proof: ContractProof;
}

/**
 * Object-oriented facade over the free functions in `contract.ts`.
 *
 * Each method is a thin delegation that threads the connected `client` and
 * the configured `retryPolicy` through to the corresponding free function,
 * so callers don't have to pass them by hand. The free functions remain the
 * low-level layer (see `docs/adr/003-client-boundary.md`); this facade is the
 * recommended entry point for application code.
 */
export class SureCirclesSDK {
  /** The network configuration this instance was created with. */
  readonly networkConfig: SureCirclesNetworkConfig;
  /** The raw contract client. Exposed for escape hatches the facade doesn't cover yet. */
  readonly client: SureCirclesClient;
  /** The default retry policy applied when a call does not pass its own. */
  readonly retryPolicy: RetryPolicy;
  /** Public key of the signer this instance transacts as. */
  readonly publicKey: string;
  /** The keypair or wallet signer this instance signs with. */
  readonly signer: Keypair | SureCirclesSigner;

  private constructor(
    networkConfig: SureCirclesNetworkConfig,
    client: SureCirclesClient,
    retryPolicy: RetryPolicy,
    publicKey: string,
    signer: Keypair | SureCirclesSigner,
  ) {
    this.networkConfig = networkConfig;
    this.client = client;
    this.retryPolicy = retryPolicy;
    this.publicKey = publicKey;
    this.signer = signer;
  }

  /**
   * Creates an SDK instance bound to one signer and one network.
   *
   * @param config - Network configuration (contract id, RPC url, passphrase).
   * @param keypairOrSigner - Keypair, or a wallet-style signer.
   * @param options - Optional overrides (e.g. a custom retry policy).
   */
  static async connect(
    config: SureCirclesNetworkConfig,
    keypairOrSigner: Keypair | SureCirclesSigner,
    options: SureCirclesSDKOptions = {},
  ): Promise<SureCirclesSDK> {
    const client = await connect(config, keypairOrSigner);
    const { publicKey } = resolveSigner(keypairOrSigner, config.networkPassphrase);
    return new SureCirclesSDK(
      config,
      client,
      options.retryPolicy ?? DEFAULT_RETRY_POLICY,
      publicKey,
      keypairOrSigner,
    );
  }

  private policy(override?: RetryPolicy): RetryPolicy {
    return override ?? this.retryPolicy;
  }

  /** Creates a new circle. Mirrors the `createCircle` free function. */
  createCircle(args: CreateCircleArgs, retryPolicy?: RetryPolicy): Promise<TxResult<bigint>> {
    return createCircle(this.client, args, this.policy(retryPolicy));
  }

  /** Funds a circle from `args.from`. Mirrors the `fund` free function. */
  fund(args: FundArgs, retryPolicy?: RetryPolicy): Promise<TxResult<void>> {
    return fund(this.client, args, this.policy(retryPolicy));
  }

  /** Claims the pot for `args.recipient`. Mirrors the `claim` free function. */
  claim(args: ClaimArgs, retryPolicy?: RetryPolicy): Promise<TxResult<void>> {
    return claim(this.client, args, this.policy(retryPolicy));
  }

  /** Reads a circle's current state. Mirrors the `getCircle` free function. */
  getCircle(circleId: bigint, retryPolicy?: RetryPolicy): Promise<CircleView> {
    return getCircle(this.client, circleId, this.policy(retryPolicy));
  }

  /**
   * Reads a circle's verification key, cached per (contract, circle) for the
   * session. Mirrors the `getVk` free function.
   */
  getVk(circleId: bigint): Promise<ContractVerificationKey> {
    return getVk(this.client, circleId, this.retryPolicy);
  }

  /** Pure read: how many circles have been created on this contract. */
  getCircleCount(retryPolicy?: RetryPolicy): Promise<bigint> {
    return getCircleCount(this.client, this.policy(retryPolicy));
  }

  /**
   * Reads a circle's contract-level status (round, pot, pot target, cancelled).
   * Mirrors the `getStatus` free function, which wraps the contract's
   * `get_status` read.
   */
  getStatus(
    circleId: bigint,
    retryPolicy?: RetryPolicy,
  ): Promise<{ round: number; pot: bigint; target: bigint; cancelled: boolean }> {
    return getStatus(this.client, circleId, this.policy(retryPolicy));
  }

  /** Pure read: whether `nullifierHash` already claimed in this circle. */
  hasClaimed(circleId: bigint, nullifierHash: bigint, retryPolicy?: RetryPolicy): Promise<boolean> {
    return hasClaimed(this.client, circleId, nullifierHash, this.policy(retryPolicy));
  }
}
