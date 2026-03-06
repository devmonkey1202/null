import { describe, it, expect } from "vitest";
import { buildPublicCacheHeaders, buildNoStoreHeaders, applyCacheHeaders } from "@/lib/cache-policy";

describe("cache policy helpers", () => {
  it("builds public cache headers with defaults", () => {
    const headers = buildPublicCacheHeaders({ maxAgeSeconds: 60 });
    expect(headers["Cache-Control"]).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(headers["CDN-Cache-Control"]).toBe(headers["Cache-Control"]);
  });

  it("builds no-store headers", () => {
    const headers = buildNoStoreHeaders();
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["Pragma"]).toBe("no-cache");
  });

  it("applies headers to response", () => {
    const res = new Response("ok");
    applyCacheHeaders(res, buildPublicCacheHeaders({ maxAgeSeconds: 10, staleWhileRevalidateSeconds: 50 }));
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=10, stale-while-revalidate=50");
    expect(res.headers.get("Surrogate-Control")).toBe("public, s-maxage=10, stale-while-revalidate=50");
  });
});
