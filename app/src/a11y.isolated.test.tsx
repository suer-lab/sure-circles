/**
 * a11y.isolated.test.tsx - accessibility guards that must re-import modules.
 *
 * These two cases call `vi.resetModules()` / `vi.doMock()` / `vi.doUnmock()`, which change
 * the module registry for the rest of the file. Run in the same file as the other a11y tests
 * they made later tests depend on execution order. Vitest isolates each test file, so keeping
 * them here means no other test can observe the module-registry changes.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { I18nProvider } from "./i18n";

vi.mock("@sure-circles/client", () => import("../../__mocks__/@sure-circles/client"));

vi.mock("./config", () => ({
  CIRCLE_SIZE: 5,
  config: {
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    testTokenContractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  },
  configError: [],
}));

// The real hook probes the configured RPC (network). Tests must stay offline.
vi.mock("./hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => true,
}));

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

const withI18n = (ui: React.ReactNode) => <I18nProvider>{ui}</I18nProvider>;

// Each case re-imports the whole app after vi.resetModules(), which takes several seconds on a cold or busy machine
// (3.4 s alone here, over the 5 s default under full-suite load). Only these cases get the longer budget.
const MODULE_RESET_TIMEOUT_MS = 30_000;

describe("axe-core - WCAG 2.1 AA, zero violations (module-reset cases)", { timeout: MODULE_RESET_TIMEOUT_MS }, () => {
  it("env-setup screen", async () => {
    // App short-circuits to EnvSetupScreen when config validation fails, so
    // the module is re-mocked for this case only.
    vi.doMock("./config", () => ({
      CIRCLE_SIZE: 5,
      config: {
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        rpcUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
        testTokenContractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      },
      configError: ["VITE_SURE_CIRCLES_CONTRACT_ID — missing", "VITE_STELLAR_RPC_URL — missing"],
    }));
    vi.resetModules();
    const { default: FreshApp } = await import("./App");
    const { container } = render(withI18n(<FreshApp />));

    expect(await axe(container)).toHaveNoViolations();
    // The whole point of the screen is naming what is missing.
    expect(screen.getByText(/VITE_SURE_CIRCLES_CONTRACT_ID/)).toBeInTheDocument();
    expect(screen.getByText(/VITE_STELLAR_RPC_URL/)).toBeInTheDocument();

    vi.doUnmock("./config");
    vi.resetModules();
  });

  it("browser-unsupported gate (#315)", async () => {
    // UnsupportedBrowserScreen is built inline by main.tsx behind a capability
    // check. Re-implementing it here would test a copy rather than the screen,
    // so main.tsx is imported with createRoot stubbed and the element tree it
    // would have rendered is captured and rendered for real.
    const captured: React.ReactNode[] = [];
    vi.doMock("react-dom/client", () => ({
      createRoot: () => ({ render: (ui: React.ReactNode) => captured.push(ui) }),
    }));
    vi.doMock("./lib/capabilities.js", () => ({
      getCapabilityReport: () => ({
        ok: false,
        missing: ["webassembly", "bigint", "crypto.subtle"],
        details: [],
      }),
    }));
    vi.resetModules();
    await import("./main");

    expect(captured, "main.tsx rendered nothing").toHaveLength(1);
    const { container } = render(withI18n(captured[0]));

    expect(await axe(container)).toHaveNoViolations();
    // The gate must name the missing capabilities or it tells the user nothing.
    expect(screen.getByRole("list", { name: /missing browser support/i })).toBeInTheDocument();
    expect(screen.getByText("WebAssembly")).toBeInTheDocument();
    expect(screen.getByText("BigInt")).toBeInTheDocument();

    vi.doUnmock("react-dom/client");
    vi.doUnmock("./lib/capabilities.js");
    vi.resetModules();
  });
});
