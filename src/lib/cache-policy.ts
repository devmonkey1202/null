export type CacheHeaders = Record<string, string>;

type PublicCacheOptions = {
  maxAgeSeconds: number;
  staleWhileRevalidateSeconds?: number;
};

function clampInt(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function buildPublicCacheHeaders(options: PublicCacheOptions): CacheHeaders {
  const maxAge = clampInt(options.maxAgeSeconds, 60);
  const stale = clampInt(options.staleWhileRevalidateSeconds ?? maxAge * 5, maxAge * 5);
  const policy = `public, s-maxage=${maxAge}, stale-while-revalidate=${stale}`;
  return {
    "Cache-Control": policy,
    "CDN-Cache-Control": policy,
    "Vercel-CDN-Cache-Control": policy,
    "Surrogate-Control": policy,
  };
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
