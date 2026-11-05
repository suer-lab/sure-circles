import { describe, it, expect, vi } from "vitest";

vi.mock("@sure-circles/client/internal", () => ({ setArtifactOnEvent: vi.fn() }));
import { SDK_EVENT_BUFFER_LIMIT } from "./useSdkEvents";

describe("useSdkEvents buffer policy", () => {
  it("exposes a finite buffer limit", () => {
    expect(SDK_EVENT_BUFFER_LIMIT).toBe(100);
    expect(SDK_EVENT_BUFFER_LIMIT).toBeLessThanOrEqual(200);
  });
});
