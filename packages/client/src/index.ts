// No `node:*` imports in this package — all modules run unmodified in both
// Node (18+) and the browser app. If a future addition needs Node-only APIs,
// add a comment guard here and gate it behind a platform check.
//
// The public API is listed name by name. Adding a symbol to a module does not
// make it public: add it here, then run `npm run gen:api-surface` and update the
// README "Public API" lists (a test keeps both in step with this file).
// Deep-integration helpers live in `internal.ts`, not here.

export {
  FRIENDBOT_ACCOUNT_XLM,
  MAX_I128,
  STROOPS_PER_XLM,
  ContributionValidationError,
  expandNumberToDecimalString,
  formatXlm,
  formatXlmDisplay,
  stroopsToXlm,
  validateContributionAmount,
  xlmToStroops,
  type ContributionValidationCause,
  type ValidateContributionOptions,
} from "./amount.js";

export {
  FR_MODULUS,
  computeExternalNullifier,
  computeNullifierHash,
  computeRecipientHash,
  generateIdentity,
  poseidon,
  randomFieldElement,
  type Identity,
} from "./identity.js";

export { ZERO_VALUE, MerkleTree, type MerkleProof } from "./tree.js";

export {
  FP_BYTES,
  encodeG1,
  encodeG2,
  feToBytes,
  fullProve,
  g1ToBytes,
  g2ToBytes,
  generateProof,
  getArtifacts,
  prove,
  validateCircuitInput,
  verificationKeyToContractFormat,
  verifyProofLocally,
  type CircuitInput,
  type ContractProof,
  type ContractVerificationKey,
  type GenerateProofResult,
  type ProofResult,
  type ProveOptions,
} from "./prove.js";

// Contribution validation is defined in `amount.ts` (and re-exported by `validate.ts`);
// it is exported once, from `amount.ts`, above.
export {
  assertInField,
  validateContractProof,
  validateContractVerificationKey,
} from "./validate.js";

export {
  EXPLORER_NETWORKS,
  cancelCircle,
  claim,
  clearContractClientCache,
  connect,
  connectReadOnly,
  createCircle,
  estimateClaimFee,
  explorerTxUrl,
  fund,
  getCircle,
  getCircleCount,
  getCircleStatus,
  getContributors,
  getPot,
  getRound,
  getStatus,
  getVk,
  hasClaimed,
  populateTxResult,
  resolveSigner,
  type CircleStatus,
  type CircleView,
  type FeeEstimate,
  type ResolvedSigner,
  type SignAndSendResult,
  type SureCirclesClient,
  type SureCirclesNetworkConfig,
  type SureCirclesSigner,
  type TxResult,
} from "./contract.js";

export { SdkEventEmitter, type OnEventFn, type SdkEvent } from "./events.js";

export { NETWORKS, isTestnet, networkOf, type NetworkPreset } from "./networks.js";

export { MAX_CIRCLE_SIZE, TREE_LEVELS } from "./config.js";

export {
  AlreadyClaimedError,
  CircleCancelledError,
  CircleNotFoundError,
  ContractError,
  InvalidCircleParamsError,
  InvalidInputError,
  InvalidProofError,
  InvalidRecipientError,
  OverflowError,
  ProvingError,
  RoundFullError,
  RoundNotExpiredError,
  RoundNotFundedError,
  RpcError,
  SureCirclesError,
  WrongRoundTagError,
  describeContractError,
  describeError,
  parseContractErrorCode,
  type ContractErrorDescription,
} from "./errors.js";

export {
  MEMBERSHIP_WASM_URL,
  MEMBERSHIP_ZKEY_URL,
  configureArtifacts,
  getArtifactsConfig,
  resetArtifactsConfig,
  startArtifactPrefetch,
  subscribeToArtifactPrefetch,
  type ArtifactPrefetchProgress,
  type ArtifactPrefetchStatus,
  type ProverArtifacts,
} from "./artifacts.js";

export { decodeContractError } from "./decodeError.js";

export {
  DEFAULT_RETRY_POLICY,
  PATIENT_RETRY_POLICY,
  POLL_RETRY_POLICY,
  computeDelay,
  withRetry,
  type RetryPolicy,
} from "./retry.js";

export {
  SureCirclesSDK,
  type ClaimArgs,
  type CreateCircleArgs,
  type FundArgs,
  type SureCirclesSDKOptions,
} from "./sdk.js";

export { makeCircleId } from "./brand.js";
export type { Brand, CircleId, ExternalNullifier, NullifierHash } from "./brand.js";
