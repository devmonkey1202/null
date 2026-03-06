// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installRuntimeMetrics, installResourceTimingTracker } from "@/lib/runtime-metrics";

type ObserverEntry = PerformanceEntry & { renderTime?: number; startTime?: number; duration?: number; initiatorType?: string };

describe("runtime metrics", () => {
  const originalObserver = globalThis.PerformanceObserver;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    let callbacks: Array<{ type?: string; cb: (list: PerformanceObserverEntryList) => void }> = [];
    class MockPerformanceObserver {
      private cb: (list: PerformanceObserverEntryList) => void;
      private type?: string;
      constructor(cb: (list: PerformanceObserverEntryList) => void) {
        this.cb = cb;
      }
      observe(options: { type: string }) {
        this.type = options.type;
        callbacks.push({ type: options.type, cb: this.cb });
      }
      disconnect() {
        // no-op
      }
    }
    (globalThis as unknown as { __perfCallbacks?: typeof callbacks }).__perfCallbacks = callbacks;
    globalThis.PerformanceObserver = MockPerformanceObserver as unknown as typeof PerformanceObserver;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
  });

  afterEach(() => {
    globalThis.PerformanceObserver = originalObserver;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("tracks LCP once and wraps fetch timings", async () => {
    const track = vi.fn();
    const cleanup = installRuntimeMetrics(track, { lcpTimeoutMs: 10 });
    const callbacks = (globalThis as unknown as { __perfCallbacks?: Array<{ type?: string; cb: (list: PerformanceObserverEntryList) => void }> }).__perfCallbacks ?? [];
    const lcpObserver = callbacks.find((c) => c.type === "largest-contentful-paint");
    expect(lcpObserver).toBeTruthy();
    lcpObserver?.cb({
      getEntries: () => [{ startTime: 123 } as ObserverEntry],
    } as PerformanceObserverEntryList);
    await fetch("https://example.com/api");
    cleanup();

    const names = track.mock.calls.map((call) => call[0]);
    expect(names).toContain("web_vitals");
    expect(names).toContain("fetch_timing");
  });

  it("tracks resource timing entries over threshold", () => {
    const track = vi.fn();
    const cleanup = installResourceTimingTracker(track);
    const callbacks = (globalThis as unknown as { __perfCallbacks?: Array<{ type?: string; cb: (list: PerformanceObserverEntryList) => void }> }).__perfCallbacks ?? [];
    const resourceObserver = callbacks.find((c) => c.type === "resource");
    expect(resourceObserver).toBeTruthy();
    resourceObserver?.cb({
      getEntries: () => [{ duration: 3500, name: "https://cdn.example.com/asset.js", initiatorType: "script" } as ObserverEntry],
    } as PerformanceObserverEntryList);
    cleanup();

    expect(track).toHaveBeenCalledWith(
      "resource_timing",
      expect.objectContaining({ duration_ms: 3500, type: "script" }),
    );
  });
});
