import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

vi.mock("./contract.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./contract.js")>();
  return {
    ...actual,
    connect: vi.fn(),
    getStatus: vi.fn(),
    getCircleCount: vi.fn(),
  };
});

import { SureCirclesSDK } from "./sdk.js";
import { connect, getCircleCount, getStatus } from "./contract.js";
import { DEFAULT_RETRY_POLICY } from "./retry.js";

const NETWORK = {
  contractId: "C" + "A".repeat(55),
  rpcUrl: "https://rpc.example.test",
  networkPassphrase: "Test SDF Network ; September 2015",
};

const fakeClient = { fake: true } as unknown as Awaited<ReturnType<typeof connect>>;

async function makeSdk(options?: Parameters<typeof SureCirclesSDK.connect>[2]) {
  vi.mocked(connect).mockResolvedValue(fakeClient);
  const keypair = Keypair.random();
  const sdk = await SureCirclesSDK.connect(NETWORK, keypair, options);
  return { sdk, keypair };
}

describe("SureCirclesSDK.connect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds the client, network, signer, public key and default retry policy", async () => {
    const { sdk, keypair } = await makeSdk();
    expect(sdk.client).toBe(fakeClient);
    expect(sdk.networkConfig).toBe(NETWORK);
    expect(sdk.signer).toBe(keypair);
    expect(sdk.publicKey).toBe(keypair.publicKey());
    expect(sdk.retryPolicy).toBe(DEFAULT_RETRY_POLICY);
  });

  it("accepts a retry policy override", async () => {
    const retryPolicy = { maxRetries: 9, baseDelayMs: 1 };
    const { sdk } = await makeSdk({ retryPolicy });
    expect(sdk.retryPolicy).toBe(retryPolicy);
  });
});

describe("SureCirclesSDK.getStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to the free getStatus and returns its result", async () => {
    const { sdk } = await makeSdk();
    const expected = { round: 3, pot: 1000n, target: 5000n, cancelled: false };
    vi.mocked(getStatus).mockResolvedValue(expected);

    const result = await sdk.getStatus(42n);

    expect(result).toEqual(expected);
    expect(getStatus).toHaveBeenCalledWith(fakeClient, 42n, DEFAULT_RETRY_POLICY);
  });

  it("prefers a per-call retry policy", async () => {
    const { sdk } = await makeSdk();
    const retryPolicy = { maxRetries: 1, baseDelayMs: 1 };
    vi.mocked(getStatus).mockResolvedValue({ round: 0, pot: 0n, target: 0n, cancelled: false });
    await sdk.getStatus(7n, retryPolicy);
    expect(getStatus).toHaveBeenCalledWith(fakeClient, 7n, retryPolicy);
  });
});

describe("SureCirclesSDK.getCircleCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to the free getCircleCount", async () => {
    const { sdk } = await makeSdk();
    vi.mocked(getCircleCount).mockResolvedValue(12n);
    expect(await sdk.getCircleCount()).toBe(12n);
    expect(getCircleCount).toHaveBeenCalledWith(fakeClient, DEFAULT_RETRY_POLICY);
  });
});
