import { getRedis } from "@/lib/redis";

const CACHE_TTL_SECONDS = 30;
const VERSION_TTL_MS = 15_000;
const CACHE_PREFIX = "appdata:cache";
const VERSION_PREFIX = "appdata:version";

type CacheEntry = { expiresAt: number; value: unknown };
type VersionEntry = { expiresAt: number; value: number };

const memoryCache = new Map<string, CacheEntry>();
const versionCache = new Map<string, VersionEntry>();

function now() {
  return Date.now();
}

function getMemory(key: string) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setMemory(key: string, value: unknown, ttlSeconds: number) {
  memoryCache.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
}

function getVersionMemory(key: string) {
  const entry = versionCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    versionCache.delete(key);
    return null;
  }
  return entry.value;
}

function setVersionMemory(key: string, value: number) {
  versionCache.set(key, { value, expiresAt: now() + VERSION_TTL_MS });
}

function versionKey(pageId: string, collectionSlug: string) {
  return `${VERSION_PREFIX}:${pageId}:${collectionSlug}`;
}

export async function getCollectionCacheVersion(pageId: string, collectionSlug: string): Promise<number> {
  const key = `${pageId}:${collectionSlug}`;
  const cached = getVersionMemory(key);
  if (cached !== null) return cached;

  const redis = getRedis();
  if (!redis) {
    setVersionMemory(key, 0);
    return 0;
  }
  try {
    const raw = await redis.get(versionKey(pageId, collectionSlug));
    const value = raw ? Number(raw) : 0;
    const safe = Number.isFinite(value) ? value : 0;
    setVersionMemory(key, safe);
    return safe;
  } catch {
    setVersionMemory(key, 0);
    return 0;
  }
}

export async function bumpCollectionCacheVersion(pageId: string, collectionSlug: string): Promise<number> {
  const key = `${pageId}:${collectionSlug}`;
  const redis = getRedis();
  if (!redis) {
    const next = (getVersionMemory(key) ?? 0) + 1;
    setVersionMemory(key, next);
    return next;
  }
  try {
    const next = await redis.incr(versionKey(pageId, collectionSlug));
    const safe = Number.isFinite(next) ? next : (getVersionMemory(key) ?? 0) + 1;
    setVersionMemory(key, safe);
    return safe;
  } catch {
    const next = (getVersionMemory(key) ?? 0) + 1;
    setVersionMemory(key, next);
    return next;
  }
}

export async function getCachedValue<T>(key: string): Promise<T | null> {
  const memoryValue = getMemory(key);
  if (memoryValue !== null) return memoryValue as T;

  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    setMemory(key, parsed, CACHE_TTL_SECONDS);
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedValue<T>(key: string, value: T, ttlSeconds = CACHE_TTL_SECONDS) {
  setMemory(key, value, ttlSeconds);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Best-effort cache
  }
}

export function buildRecordCacheKey(
  pageId: string,
  collectionSlug: string,
  version: number,
  recordId: string,
  appUserId?: string | null,
) {
  return `${CACHE_PREFIX}:record:${pageId}:${collectionSlug}:${version}:${recordId}:${appUserId ?? "all"}`;
}

export function buildListCacheKey(
  pageId: string,
  collectionSlug: string,
  version: number,
  limit: number,
  offset: number,
  orderBy: string,
  orderDir: string,
  appUserId?: string | null,
) {
  return `${CACHE_PREFIX}:list:${pageId}:${collectionSlug}:${version}:${limit}:${offset}:${orderBy}:${orderDir}:${appUserId ?? "all"}`;
}

export function resetAppDataCacheForTests() {
  memoryCache.clear();
  versionCache.clear();
}
