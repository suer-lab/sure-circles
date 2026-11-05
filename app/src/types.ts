import type { Keypair } from "@stellar/stellar-sdk";
import type { Identity, FeeEstimate } from "@sure-circles/client";

export interface Member {
  keypair: Keypair;
  identity: Identity;
  funded: boolean;
  fundHash?: string;
  /** Set when this member's contribution was signed by Freighter rather than a demo key. */
  freighterKey?: string;
  ineligible?: boolean | undefined;
  ineligibleReason?: string | undefined;
  /** Optimistic flag while this member's funding transaction is in flight. */
  pending?: boolean;
}

export interface ClaimResult {
  recipient: string;
  hash: string;
  /** Optional: proving/verify timing instrumentation is deferred (docs/deferred-features.md). */
  proofDurationMs?: number;
  verifyTimeMs?: number;
  /** Actual fee charged for the claim transaction, in stroops. */
  feeCharged?: string;
  /** Pre-flight fee estimate shown before signing. */
  feeEstimate?: FeeEstimate;
}

/** The visible stages of a claim, in the order they actually occur. */
export type ClaimStage = "artifacts" | "proving" | "verifying" | "funding" | "submitting";
