import { test, beforeEach, afterAll as after } from "vitest";
import assert from "node:assert";
import {
  MEMBERSHIP_WASM_URL,
  MEMBERSHIP_ZKEY_URL,
  __resetForTesting,
  configureArtifacts,
  getArtifactPrefetchProgress,
  getArtifactsConfig,
  prefetchMembershipArtifacts,
  resetArtifactsConfig,
  startArtifactPrefetch,
  subscribeToArtifactPrefetch,
} from "./artifacts.js";
import type { SdkEvent } from "./events.js";

// Utility to create a controllable ReadableStream
function createControllableStream() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return { stream, controller: controller! };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Mock fetch globally
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

// Module state (config, memoised prefetch, listeners) is shared, so reset it for every test.
beforeEach(() => {
  resetArtifactsConfig();
  __resetForTesting();
  globalThis.fetch = originalFetch;
});

test("defaults point at the app-facing circuit URLs", () => {
  const config = getArtifactsConfig();
  assert.strictEqual(config.wasmUrl, MEMBERSHIP_WASM_URL);
  assert.strictEqual(config.zkeyUrl, MEMBERSHIP_ZKEY_URL);
  assert.strictEqual(MEMBERSHIP_WASM_URL, "/circuits/membership.wasm");
  assert.strictEqual(MEMBERSHIP_ZKEY_URL, "/circuits/membership_final.zkey");
  assert.strictEqual(config.fetchImpl, undefined);
});

test("fraction is null when content-length is missing", async () => {
  const { stream: wasmStream, controller: wasmController } = createControllableStream();
  const { stream: zkeyStream, controller: zkeyController } = createControllableStream();

  globalThis.fetch = async (url: string | URL | globalThis.Request) => {
    const urlStr = url.toString();
    if (urlStr.includes("wasm")) {
      return new Response(wasmStream, { headers: new Headers() });
    }
    return new Response(zkeyStream, { headers: new Headers() });
  };

  const promise = prefetchMembershipArtifacts();
  await tick();

  let progress = getArtifactPrefetchProgress();
  assert.strictEqual(progress.status, "loading");
  assert.strictEqual(progress.fraction, null);

  wasmController.enqueue(new Uint8Array([1, 2, 3]));
  await tick();

  progress = getArtifactPrefetchProgress();
  assert.strictEqual(progress.fraction, null);
  assert.strictEqual(progress.loaded, 3);

  wasmController.close();
  zkeyController.close();
  await promise;

  progress = getArtifactPrefetchProgress();
  assert.strictEqual(progress.status, "ready");
  assert.strictEqual(progress.fraction, 1);
});

test("fraction is monotonically increasing when content-length is present", async () => {
  const { stream: wasmStream, controller: wasmController } = createControllableStream();
  const { stream: zkeyStream, controller: zkeyController } = createControllableStream();

  globalThis.fetch = async (url: string | URL | globalThis.Request) => {
    const urlStr = url.toString();
    if (urlStr.includes("wasm")) {
      return new Response(wasmStream, { headers: new Headers({ "content-length": "10" }) });
    }
    return new Response(zkeyStream, { headers: new Headers({ "content-length": "20" }) });
  };

  const promise = prefetchMembershipArtifacts();
  await tick();

  wasmController.enqueue(new Uint8Array(5));
  await tick();

  let progress = getArtifactPrefetchProgress();
  assert.strictEqual(progress.loaded, 5);
  assert.strictEqual(progress.total, 30);
  assert.strictEqual(progress.fraction, 5 / 30);

  zkeyController.enqueue(new Uint8Array(10));
  await tick();

  progress = getArtifactPrefetchProgress();
  assert.strictEqual(progress.loaded, 15);
  assert.strictEqual(progress.fraction, 15 / 30);

  wasmController.close();
  zkeyController.close();
  await promise;

  progress = getArtifactPrefetchProgress();
  assert.strictEqual(progress.status, "ready");
  assert.strictEqual(progress.fraction, 1);
});

test("concurrent prefetch calls share one download", async () => {
  let fetchCount = 0;

  const { stream: wasmStream, controller: wasmController } = createControllableStream();
  const { stream: zkeyStream, controller: zkeyController } = createControllableStream();

  globalThis.fetch = async (url: string | URL | globalThis.Request) => {
    fetchCount++;
    const urlStr = url.toString();
    if (urlStr.includes("wasm")) {
      return new Response(wasmStream, { headers: new Headers() });
    }
    return new Response(zkeyStream, { headers: new Headers() });
  };

  const p1 = prefetchMembershipArtifacts();
  const p2 = prefetchMembershipArtifacts();
  // startArtifactPrefetch is the app-facing alias of the same memoised download.
  const p3 = startArtifactPrefetch();

  assert.strictEqual(p1, p2);
  assert.strictEqual(p1, p3);

  wasmController.close();
  zkeyController.close();
  await p1;

  // Only two fetches: one for the wasm, one for the zkey.
  assert.strictEqual(fetchCount, 2);
});

test("a completed prefetch is cached and not downloaded again", async () => {
  let fetchCount = 0;
  globalThis.fetch = async (url: string | URL | globalThis.Request) => {
    fetchCount++;
    return new Response(new Uint8Array(url.toString().includes("wasm") ? 4 : 8));
  };

  const first = await prefetchMembershipArtifacts();
  const second = await prefetchMembershipArtifacts();

  assert.strictEqual(first, second);
  assert.strictEqual(first.wasm.byteLength, 4);
  assert.strictEqual(first.zkey.byteLength, 8);
  assert.strictEqual(fetchCount, 2);
});

test("failed download publishes status: 'error' and rejects", async () => {
  globalThis.fetch = async () => {
    throw new Error("Network offline");
  };

  await assert.rejects(prefetchMembershipArtifacts(), /Network offline/);

  const progress = getArtifactPrefetchProgress();
  assert.strictEqual(progress.status, "error");
  assert.strictEqual(progress.error?.message, "Network offline");
});

test("failed response publishes status: 'error' and rejects", async () => {
  globalThis.fetch = async () => {
    return new Response(null, { status: 404 });
  };

  await assert.rejects(prefetchMembershipArtifacts(), /Unable to download circuit artifact/);

  const progress = getArtifactPrefetchProgress();
  assert.strictEqual(progress.status, "error");
  assert.ok(progress.error?.message.includes("Unable to download"));
});

test("a failed prefetch is not cached, so the next call retries and can succeed", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    if (attempts <= 2) throw new Error("Network offline");
    return new Response(new Uint8Array([1, 2]));
  };

  await assert.rejects(prefetchMembershipArtifacts(), /Network offline/);
  assert.strictEqual(getArtifactPrefetchProgress().status, "error");

  const artifacts = await prefetchMembershipArtifacts();
  assert.strictEqual(artifacts.wasm.byteLength, 2);
  assert.strictEqual(getArtifactPrefetchProgress().status, "ready");
});

test("subscribe immediately calls back with current progress and unsubscribing stops delivery", async () => {
  const { stream: wasmStream, controller: wasmController } = createControllableStream();
  const { stream: zkeyStream, controller: zkeyController } = createControllableStream();

  globalThis.fetch = async (url: string | URL | globalThis.Request) => {
    const urlStr = url.toString();
    if (urlStr.includes("wasm")) {
      return new Response(wasmStream, { headers: new Headers() });
    }
    return new Response(zkeyStream, { headers: new Headers() });
  };

  const states: string[] = [];
  const unsubscribe = subscribeToArtifactPrefetch((p) => {
    states.push(p.status);
  });

  // Should immediately receive the current 'idle' state
  assert.deepStrictEqual(states, ["idle"]);

  const p = prefetchMembershipArtifacts();
  await tick();

  // Should now have 'loading' states
  assert.ok(states.includes("loading"));

  const statesLengthBeforeUnsubscribe = states.length;
  unsubscribe();

  wasmController.enqueue(new Uint8Array(10));
  await tick();

  // states should not have increased because we unsubscribed
  assert.strictEqual(states.length, statesLengthBeforeUnsubscribe);

  wasmController.close();
  zkeyController.close();
  await p;
});

test("an AbortSignal cancels its own prefetch without poisoning the shared cache", async () => {
  const { stream: wasmStream, controller: wasmController } = createControllableStream();
  const { stream: zkeyStream, controller: zkeyController } = createControllableStream();

  let calls = 0;
  globalThis.fetch = async (url: string | URL | globalThis.Request, init?: RequestInit) => {
    calls++;
    if (calls > 2) return new Response(new Uint8Array([9]));
    const urlStr = url.toString();
    const stream = urlStr.includes("wasm") ? wasmStream : zkeyStream;
    // The module itself cancels its reader when the signal fires; the mock does not help it.
    void init;
    return new Response(stream, { headers: new Headers() });
  };

  const controller = new AbortController();
  const promise = prefetchMembershipArtifacts(controller.signal);
  const rejected = assert.rejects(promise, (err: unknown) => {
    return err instanceof DOMException && err.name === "AbortError";
  });
  await tick();

  controller.abort();
  await rejected;

  // An intentional abort is not a download error: no 'error' status is published.
  assert.notStrictEqual(getArtifactPrefetchProgress().status, "error");

  try {
    wasmController.close();
  } catch {
    // ignore
  }
  try {
    zkeyController.close();
  } catch {
    // ignore
  }

  // The shared background cache is unaffected: a later no-signal call downloads normally.
  const artifacts = await prefetchMembershipArtifacts();
  assert.strictEqual(artifacts.wasm.byteLength, 1);
});

test("an already-aborted signal rejects before any fetch", async () => {
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return new Response(new Uint8Array(1));
  };

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(prefetchMembershipArtifacts(controller.signal));
  assert.strictEqual(fetched, false);
});

test("configureArtifacts overrides the URLs and fetch implementation and resets the cache", async () => {
  const requested: string[] = [];
  const customFetch = async (url: string | URL | globalThis.Request) => {
    requested.push(url.toString());
    return new Response(new Uint8Array([7, 7, 7]));
  };

  configureArtifacts({
    wasmUrl: "https://cdn.example.test/c.wasm",
    zkeyUrl: "https://cdn.example.test/c.zkey",
    fetchImpl: customFetch,
  });

  const config = getArtifactsConfig();
  assert.strictEqual(config.wasmUrl, "https://cdn.example.test/c.wasm");
  assert.strictEqual(config.zkeyUrl, "https://cdn.example.test/c.zkey");
  assert.strictEqual(config.fetchImpl, customFetch);

  // The global fetch must not be used when a custom one is configured.
  globalThis.fetch = async () => {
    throw new Error("global fetch should not be called");
  };

  const artifacts = await prefetchMembershipArtifacts();
  assert.deepStrictEqual(requested.sort(), [
    "https://cdn.example.test/c.wasm",
    "https://cdn.example.test/c.zkey",
  ]);
  assert.strictEqual(artifacts.zkey.byteLength, 3);

  // Reconfiguring drops the memoised result, so the next call downloads again.
  configureArtifacts({ wasmUrl: "https://cdn.example.test/other.wasm" });
  await prefetchMembershipArtifacts();
  assert.ok(requested.includes("https://cdn.example.test/other.wasm"));
  assert.strictEqual(getArtifactsConfig().zkeyUrl, "https://cdn.example.test/c.zkey");

  resetArtifactsConfig();
  assert.strictEqual(getArtifactsConfig().wasmUrl, MEMBERSHIP_WASM_URL);
  assert.strictEqual(getArtifactsConfig().fetchImpl, undefined);
});

test("onEvent receives artifact:started, then artifact:ready (once each)", async () => {
  const events: SdkEvent[] = [];
  configureArtifacts({ onEvent: (event) => events.push(event) });

  globalThis.fetch = async (url: string | URL | globalThis.Request) =>
    new Response(new Uint8Array(url.toString().includes("wasm") ? 4 : 6));

  await prefetchMembershipArtifacts();

  assert.deepStrictEqual(
    events.map((e) => e.type),
    ["artifact:started", "artifact:ready"],
  );
  const ready = events[1];
  assert.ok(ready && ready.type === "artifact:ready");
  assert.strictEqual(ready.loaded, 10);
});

test("onEvent receives artifact:error with the failure message", async () => {
  const events: SdkEvent[] = [];
  configureArtifacts({ onEvent: (event) => events.push(event) });

  globalThis.fetch = async () => new Response(null, { status: 500 });

  await assert.rejects(prefetchMembershipArtifacts(), /Unable to download circuit artifact \(500\)/);

  const last = events[events.length - 1];
  assert.ok(last && last.type === "artifact:error");
  assert.match(last.message, /\(500\)/);
});
