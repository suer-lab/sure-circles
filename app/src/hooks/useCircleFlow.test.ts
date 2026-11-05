import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCircleFlow } from "./useCircleFlow";

// Point at the manual mock explicitly
vi.mock("@sure-circles/client", () => import("../../../__mocks__/@sure-circles/client"));

vi.mock("../config", () => ({
  config: {
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    testTokenContractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  },
  configError: [],
}));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    Keypair: {
      random: vi.fn(() => ({
        publicKey: () => "GMOCKPUBLICKEY000000000000000000000000000000000000000000",
        secret: () => "SMOCKSECRETKEY000000000000000000000000000000000000000000",
      })),
      fromSecret: vi.fn((sec: string) => ({
        publicKey: () => "GMOCKPUBLICKEY000000000000000000000000000000000000000000",
        secret: () => sec,
      })),
    },
  };
});

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (typeof url === "string" && url.includes("verification_key.json")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        alpha: "0x01",
        beta: "0x02",
        gamma: "0x03",
        delta: "0x04",
        ic: ["0x05"],
      }),
    });
  }
  if (typeof url === "string" && (url.includes(".wasm") || url.includes(".zkey"))) {
    return Promise.resolve({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
  }
  return Promise.resolve({
    ok: true,
    json: async () => ({}),
  });
});

window.confirm = vi.fn().mockReturnValue(true);

describe("useCircleFlow hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  function setupHook() {
    return renderHook(() => useCircleFlow());
  }

  it("initializes with default landing state", () => {
    const { result } = setupHook();

    expect(result.current.screen).toBe("landing");
    expect(result.current.circlePhase).toBe("idle");
    expect(result.current.busy).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.contributionXlm).toBe(10);
    expect(result.current.members).toEqual([]);
    expect(result.current.circleId).toBeNull();
    expect(result.current.round).toBe(0);
    expect(result.current.pot).toBe(0n);
    expect(result.current.claimantIndex).toBe(0);
    expect(result.current.claimResult).toBeNull();
    expect(result.current.rejection).toBeNull();
    expect(result.current.previousCircleId).toBeNull();
    expect(result.current.feeEstimate).toBeNull();
    expect(result.current.fundingResults).toEqual([]);
    expect(result.current.fundedCount).toBe(0);
    expect(result.current.fullyFunded).toBe(false);
  });

  it("starts a circle successfully", async () => {
    const { result } = setupHook();

    await act(async () => {
      await result.current.startCircle();
    });

    expect(result.current.screen).toBe("circle");
    expect(result.current.circlePhase).toBe("ready");
    expect(result.current.circleId).toBe(37n);
    expect(result.current.members).toHaveLength(5);
    expect(result.current.round).toBe(0);
    expect(result.current.pot).toBe(0n);
    expect(result.current.busy).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("funds a member via friendbot and updates member status", async () => {
    const { result } = setupHook();

    await act(async () => {
      await result.current.startCircle();
    });

    await act(async () => {
      await result.current.fundMember(0);
    });

    expect(result.current.members[0]?.funded).toBe(true);
    expect(result.current.members[0]?.fundHash).toBe("mockFundHash");
    expect(result.current.fundedCount).toBe(1);
  });

  it("updates claimantIndex with setClaimantIndex", async () => {
    const { result } = setupHook();

    act(() => {
      result.current.setClaimantIndex(3);
    });

    expect(result.current.claimantIndex).toBe(3);
  });

  it("executes doClaim successfully and records the claim result", async () => {
    const { result } = setupHook();

    await act(async () => {
      await result.current.startCircle();
    });

    await act(async () => {
      await result.current.doClaim();
    });

    expect(result.current.claimResult).not.toBeNull();
    expect(result.current.claimResult?.hash).toBe("mockClaimHash");
  });

  it("replays a claim with claimAgain", async () => {
    const { result } = setupHook();

    await act(async () => {
      await result.current.startCircle();
      await result.current.doClaim();
    });

    await act(async () => {
      await result.current.claimAgain();
    });

    expect(result.current.rejection).toBeDefined();
  });

  it("resets back to landing screen and updates previousCircleId", async () => {
    const { result } = setupHook();

    await act(async () => {
      await result.current.startCircle();
    });
    expect(result.current.circleId).toBe(37n);

    act(() => {
      result.current.resetToLanding();
    });

    expect(result.current.screen).toBe("landing");
    expect(result.current.circleId).toBeNull();
    expect(result.current.previousCircleId).toBe(37n);
    expect(result.current.members).toHaveLength(0);
  });
});
