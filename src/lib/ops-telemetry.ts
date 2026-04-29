import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type AvailabilityEntry = {
  ts: string;
  ok: boolean;
  db_ok?: boolean;
  latency_ms: number;
  source: "public" | "ops";
  meta?: Record<string, unknown>;
};

type SystemLogLevel = "info" | "warn" | "error" | "fatal";

type SystemEntry = {
  ts: string;
  level: SystemLogLevel;
  message: string;
  source?: string;
  meta?: unknown;
};

type SecurityEntry = {
  ts: string;
  action: string;
  path?: string;
  ip?: string;
  meta?: Record<string, unknown>;
};

type TopCount = {
  key: string;
  count: number;
};

type TimeBucket = {
  bucket: string;
  total: number;
  okCount: number;
  avgLatencyMs: number | null;
};

export type OpsTelemetrySnapshot = {
  generatedAt: string;
  windowHours: number;
  files: {
    system: { exists: boolean; bytes: number; modifiedAt: string | null };
    security: { exists: boolean; bytes: number; modifiedAt: string | null };
    availability: { exists: boolean; bytes: number; modifiedAt: string | null };
  };
  availability: {
    total: number;
    okCount: number;
    okRate: number | null;
    dbOkCount: number;
    dbOkRate: number | null;
    avgLatencyMs: number | null;
    latest: AvailabilityEntry | null;
    buckets: TimeBucket[];
  };
  system: {
    total: number;
    byLevel: Record<SystemLogLevel, number>;
    topMessages: TopCount[];
    latestErrors: SystemEntry[];
  };
  security: {
    total: number;
    topActions: TopCount[];
    latest: SecurityEntry[];
  };
};

type ReadJsonLinesOptions = {
  limit: number;
};

const LOG_DIR = join(process.cwd(), "logs");
const SYSTEM_LOG_FILE = join(LOG_DIR, "system.log");
const SECURITY_LOG_FILE = join(LOG_DIR, "security.log");
const AVAILABILITY_LOG_FILE = join(LOG_DIR, "availability.log");

function fileMeta(filePath: string) {
  if (!existsSync(filePath)) {
    return {
      exists: false,
      bytes: 0,
      modifiedAt: null,
    };
  }
  const stat = statSync(filePath);
  return {
    exists: true,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function readJsonLines<T>(filePath: string, options: ReadJsonLinesOptions): T[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const recent = lines.slice(Math.max(0, lines.length - options.limit));
  return recent
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is T => Boolean(entry));
}

function filterRecentEntries<T extends { ts: string }>(entries: T[], windowHours: number, nowMs = Date.now()) {
  const since = nowMs - windowHours * 60 * 60 * 1000;
  return entries.filter((entry) => {
    const ts = Date.parse(entry.ts);
    return Number.isFinite(ts) && ts >= since;
  });
}

function roundRate(value: number) {
  return Number(value.toFixed(4));
}

function toTopCounts(source: Map<string, number>, limit: number) {
  return Array.from(source.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.key.localeCompare(b.key)))
    .slice(0, limit);
}

function toHourBucket(ts: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

export function summarizeAvailabilityEntries(entries: AvailabilityEntry[], windowHours: number, now = new Date()) {
  const recent = filterRecentEntries(entries, windowHours, now.getTime());
  const total = recent.length;
  const okCount = recent.filter((entry) => entry.ok).length;
  const dbOkCount = recent.filter((entry) => entry.db_ok === true).length;
  const avgLatencyMs =
    total > 0 ? Math.round(recent.reduce((sum, entry) => sum + (entry.latency_ms || 0), 0) / total) : null;

  const bucketMap = new Map<string, { total: number; okCount: number; latencySum: number }>();
  for (const entry of recent) {
    const bucket = toHourBucket(entry.ts);
    const current = bucketMap.get(bucket) ?? { total: 0, okCount: 0, latencySum: 0 };
    current.total += 1;
    if (entry.ok) current.okCount += 1;
    current.latencySum += entry.latency_ms || 0;
    bucketMap.set(bucket, current);
  }

  const buckets = Array.from(bucketMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, value]) => ({
      bucket,
      total: value.total,
      okCount: value.okCount,
      avgLatencyMs: value.total > 0 ? Math.round(value.latencySum / value.total) : null,
    }));

  return {
    total,
    okCount,
    okRate: total > 0 ? roundRate(okCount / total) : null,
    dbOkCount,
    dbOkRate: total > 0 ? roundRate(dbOkCount / total) : null,
    avgLatencyMs,
    latest: recent.at(-1) ?? null,
    buckets,
  };
}

export function summarizeSystemEntries(entries: SystemEntry[], windowHours: number, now = new Date()) {
  const recent = filterRecentEntries(entries, windowHours, now.getTime());
  const byLevel: Record<SystemLogLevel, number> = {
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0,
  };
  const messageCounts = new Map<string, number>();
  for (const entry of recent) {
    byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
    const key = entry.message?.trim() || "unknown";
    messageCounts.set(key, (messageCounts.get(key) ?? 0) + 1);
  }
  const latestErrors = recent
    .filter((entry) => entry.level === "warn" || entry.level === "error" || entry.level === "fatal")
    .slice(-20)
    .reverse();

  return {
    total: recent.length,
    byLevel,
    topMessages: toTopCounts(messageCounts, 8),
    latestErrors,
  };
}

export function summarizeSecurityEntries(entries: SecurityEntry[], windowHours: number, now = new Date()) {
  const recent = filterRecentEntries(entries, windowHours, now.getTime());
  const actionCounts = new Map<string, number>();
  for (const entry of recent) {
    const key = entry.action?.trim() || "unknown";
    actionCounts.set(key, (actionCounts.get(key) ?? 0) + 1);
  }
  return {
    total: recent.length,
    topActions: toTopCounts(actionCounts, 8),
    latest: recent.slice(-20).reverse(),
  };
}

export function buildOpsTelemetrySnapshot(options?: { windowHours?: number; limit?: number; now?: Date }): OpsTelemetrySnapshot {
  const windowHours = Math.max(1, Math.min(168, options?.windowHours ?? 24));
  const limit = Math.max(100, Math.min(20000, options?.limit ?? 5000));
  const now = options?.now ?? new Date();

  const availability = summarizeAvailabilityEntries(
    readJsonLines<AvailabilityEntry>(AVAILABILITY_LOG_FILE, { limit }),
    windowHours,
    now,
  );
  const system = summarizeSystemEntries(readJsonLines<SystemEntry>(SYSTEM_LOG_FILE, { limit }), windowHours, now);
  const security = summarizeSecurityEntries(readJsonLines<SecurityEntry>(SECURITY_LOG_FILE, { limit }), windowHours, now);

  return {
    generatedAt: now.toISOString(),
    windowHours,
    files: {
      system: fileMeta(SYSTEM_LOG_FILE),
      security: fileMeta(SECURITY_LOG_FILE),
      availability: fileMeta(AVAILABILITY_LOG_FILE),
    },
    availability,
    system,
    security,
  };
}
