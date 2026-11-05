/**
 * Manual mock for @sure-circles/client/internal (internal-only helpers).
 *
 * Mirrors the real subpath export surface in packages/client/src/internal.ts for
 * the members the app uses. Use via:
 *   vi.mock("@sure-circles/client/internal", () => import("../../__mocks__/@sure-circles/client/internal"));
 */
import { vi } from "vitest";
import type { ArtifactPrefetchProgress } from "../../../packages/client/src/artifacts.js";

const IDLE_PREFETCH: ArtifactPrefetchProgress = {
  status: "idle",
  loaded: 0,
  total: null,
  fraction: null,
};

export const setArtifactOnEvent = vi.fn((_onEvent?: unknown): void => {});

export const getArtifactPrefetchProgress = vi.fn((): ArtifactPrefetchProgress => IDLE_PREFETCH);

export const prefetchMembershipArtifacts = vi.fn(async (): Promise<unknown> => ({}));

export const subscribeToArtifactPrefetch = vi.fn(
  (listener: (progress: ArtifactPrefetchProgress) => void): (() => void) => {
    listener(IDLE_PREFETCH);
    return () => {};
  },
);
