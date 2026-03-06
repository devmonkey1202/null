import { logSystemEvent } from "@/lib/system-log";

export type CacheHeaders = Record<string, string>;

type PublicCacheOptions = {
  maxAgeSeconds: number;
  staleWhileRevalidateSeconds?: number;
  tags?: string[];
};

function clampInt(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function normalizeCacheTags(tags: string[]) {
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .map((tag) => tag.replace(/[^a-z0-9:_-]/g, ""));
  return Array.from(new Set(normalized));
}

export function buildSurrogateKeyHeader(tags: string[]): CacheHeaders {
  const normalized = normalizeCacheTags(tags);
  if (normalized.length === 0) return {};
  return { "Surrogate-Key": normalized.join(" ") };
}

export type CachePurgeEntry = {
  ts: string;
  tags: string[];
  reason?: string | null;
  actor?: { adminId?: string | null } | null;
};

export function recordCachePurge(input: { tags: string[]; reason?: string; actor?: { adminId?: string | null } }) {
  const tags = normalizeCacheTags(input.tags);
  const entry: CachePurgeEntry = {
    ts: new Date().toISOString(),
    tags,
    reason: input.reason ?? null,
    actor: input.actor ?? null,
  };
  logSystemEvent("info", "cache_purge", entry, "cache");
  return entry;
}

export function buildPublicCacheHeaders(options: PublicCacheOptions): CacheHeaders {
  const maxAge = clampInt(options.maxAgeSeconds, 60);
  const stale = clampInt(options.staleWhileRevalidateSeconds ?? maxAge * 5, maxAge * 5);
  const policy = `public, s-maxage=${maxAge}, stale-while-revalidate=${stale}`;
  const headers: CacheHeaders = {
    "Cache-Control": policy,
    "CDN-Cache-Control": policy,
    "Vercel-CDN-Cache-Control": policy,
    "Surrogate-Control": policy,
  };
  Object.assign(headers, buildSurrogateKeyHeader(options.tags ?? []));
  return headers;
}

export function buildNoStoreHeaders(): CacheHeaders {
  return {
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store",
    "Pragma": "no-cache",
  };
}

export function applyCacheHeaders(response: Response, headers: CacheHeaders) {
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export function withPublicCache(response: Response, options: PublicCacheOptions) {
  return applyCacheHeaders(response, buildPublicCacheHeaders(options));
}

export function withNoStore(response: Response) {
  return applyCacheHeaders(response, buildNoStoreHeaders());
}
