/// <reference types="vitest" />
import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import fs from "fs";
import path from "path";
import viteConfig from "./vite.config.js";

// Shares the same plugin-react config as vite.config.ts so JSX transform and
// Fast Refresh are applied identically in tests and in the dev server.
const thresholdsPath = path.resolve(__dirname, "..", "coverage-thresholds.json");
let appThreshold = { statements: 0, branches: 0, functions: 0, lines: 0 };
try {
  const data = fs.readFileSync(thresholdsPath, "utf8");
  const parsed = JSON.parse(data);
  if (parsed && parsed.app) appThreshold = parsed.app;
} catch (e) {
  // Missing thresholds file is non-fatal; continue with permissive defaults
}

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      // `@sure-circles/client` points at dist/ (not built when running unit tests), so resolve
      // it to the TypeScript source, as the tsconfig `paths` do for type-checking.
      alias: [
        {
          find: /^@sure-circles\/client\/internal$/,
          replacement: path.resolve(__dirname, "../packages/client/src/internal.ts"),
        },
        {
          find: /^@sure-circles\/client$/,
          replacement: path.resolve(__dirname, "../packages/client/src/index.ts"),
        },
      ],
    },
    test: {
      // jsdom provides a browser-like DOM environment without a real browser.
      environment: "jsdom",
      // Import @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
      // globally before every test file.
      setupFiles: ["./src/setupTests.ts"],
      globals: true,
      // Playwright specs live in e2e/ and run via `npm run test:e2e` (mock by
      // default, live only with E2E_LIVE=1). They must never be collected here,
      // so `npm test` stays fast and cannot touch a browser or the network.
      exclude: [...configDefaults.exclude, "e2e/**"],
      // No `test.env` VITE_* defaults here on purpose. Whatever is stubbed here
      // is baked into import.meta.env for the whole run, so config.test.ts's
      // "reports missing" cases could never see a genuinely absent variable —
      // vi.stubEnv(key, undefined) cannot undo a value that was injected at
      // transform time. Tests that need a valid config mock ./config (see
      // App.test.tsx) or stub the variables themselves (config.test.ts).
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov", "json"],
        include: ["src/**/*.{ts,tsx,js,jsx}"],
        exclude: ["**/*.test.*", "**/test-setup.*"],
        reportsDirectory: "coverage/app",
        thresholds: {
          statements: appThreshold.statements,
          branches: appThreshold.branches,
          functions: appThreshold.functions,
          lines: appThreshold.lines,
        },
      },
    },
  }),
);
