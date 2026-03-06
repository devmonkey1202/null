export type RuntimeTrack = (name: string, props: Record<string, unknown>) => void;

type RuntimeMetricsOptions = {
  trackFetch?: boolean;
  trackResources?: boolean;
  lcpTimeoutMs?: number;
};

const DEFAULT_LCP_TIMEOUT_MS = 6000;
const FETCH_WRAPPED_FLAG = "__nullFetchWrapped";

function getSafeTrack(track?: RuntimeTrack) {
  return typeof track === "function" ? track : null;
}

export function installRuntimeMetrics(track?: RuntimeTrack, options: RuntimeMetricsOptions = {}) {
  if (typeof window === "undefined") return () => {};
  const safeTrack = getSafeTrack(track);
  if (!safeTrack) return () => {};

  let disposed = false;
  let sent = false;
  let observer: PerformanceObserver | null = null;
  let timeoutId: number | null = null;

  const sendLcp = (ms: number) => {
    if (disposed || sent) return;
    sent = true;
    safeTrack("web_vitals", { metric: "LCP", lcp_ms: Math.round(ms) });
  };

  const cleanup = () => {
    disposed = true;
    if (observer) observer.disconnect();
    if (timeoutId != null) window.clearTimeout(timeoutId);
  };

  try {
    if ("PerformanceObserver" in window) {
      observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; startTime?: number };
        if (!last) return;
        if (typeof last.renderTime === "number") sendLcp(last.renderTime);
        else if (typeof last.startTime === "number") sendLcp(last.startTime);
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      const timeout = options.lcpTimeoutMs ?? DEFAULT_LCP_TIMEOUT_MS;
      timeoutId = window.setTimeout(() => {
        if (disposed || sent) return;
        const entries = performance.getEntriesByType("largest-contentful-paint");
        const last = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; startTime?: number };
        if (!last) return;
        if (typeof last.renderTime === "number") sendLcp(last.renderTime);
        else if (typeof last.startTime === "number") sendLcp(last.startTime);
      }, timeout);
    }
  } catch {
    // ignore observer errors
  }

  let restoreFetch: (() => void) | null = null;
  if (options.trackFetch !== false && typeof window.fetch === "function") {
    const anyWindow = window as unknown as Record<string, unknown>;
    if (!anyWindow[FETCH_WRAPPED_FLAG]) {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (async (...args: Parameters<typeof fetch>) => {
        const start = performance.now();
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request | undefined)?.url ?? "";
        try {
          const response = await originalFetch(...args);
          const elapsed = performance.now() - start;
          safeTrack("fetch_timing", {
            url,
            status: response.status,
            ok: response.ok,
            elapsed_ms: Math.round(elapsed),
          });
          return response;
        } catch (err) {
          const domain = url ? url.replace(/^https?:\/\//, "").split("/")[0].slice(0, 64) : "";
          safeTrack("resource_failed", {
            url_domain: domain,
            reason: (err as Error | undefined)?.message?.slice(0, 100) ?? "fetch_error",
          });
          throw err;
        }
      }) as typeof window.fetch;
      anyWindow[FETCH_WRAPPED_FLAG] = true;
      restoreFetch = () => {
        window.fetch = originalFetch;
        anyWindow[FETCH_WRAPPED_FLAG] = false;
      };
    }
  }

  return () => {
    cleanup();
    if (restoreFetch) restoreFetch();
  };
}

export function installResourceTimingTracker(track?: RuntimeTrack) {
  if (typeof window === "undefined") return () => {};
  const safeTrack = getSafeTrack(track);
  if (!safeTrack) return () => {};
  let obs: PerformanceObserver | null = null;
  try {
    obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & { duration?: number; name?: string; initiatorType?: string };
        if (typeof e.duration !== "number" || e.duration < 3000) continue;
        const url = e.name?.replace(/^https?:\/\//, "").split("/")[0].slice(0, 64) ?? "";
        safeTrack("resource_timing", {
          url_domain: url,
          duration_ms: Math.round(e.duration),
          type: e.initiatorType ?? "resource",
        });
      }
    });
    obs.observe({ type: "resource", buffered: true });
  } catch {
    return () => {};
  }
  return () => {
    obs?.disconnect();
  };
}
