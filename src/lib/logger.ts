import { randomUUID } from "crypto";
import { logSystemEvent } from "@/lib/system-log";

type LogLevel = "info" | "warn" | "error";

type LogPayload = Record<string, unknown> & {
  level: LogLevel;
  message: string;
  ts: string;
};

const requestIds = new WeakMap<Request, string>();
const lastLogAt = new Map<string, number>();

function safeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const payload: LogPayload = {
    level,
    message,
    ts: new Date().toISOString(),
    ...(meta ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function getRequestId(req: Request): string {
  const existing = requestIds.get(req);
  if (existing) return existing;
  const headerId = req.headers.get("x-request-id");
  const requestId = headerId && headerId.length <= 128 ? headerId : `req_${randomUUID()}`;
  requestIds.set(req, requestId);
  return requestId;
}

export function getRequestContext(req: Request, requestId?: string) {
  const id = requestId ?? getRequestId(req);
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
  const path = (() => {
    try {
      return new URL(req.url).pathname;
    } catch {
      return req.url;
    }
  })();
  return {
    request_id: id,
    method: req.method,
    path,
    ip,
  };
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  writeLog("info", message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  writeLog("warn", message, meta);
}

export function logError(message: string, meta?: Record<string, unknown>) {
  logSystemEvent("error", message, meta, "server");
  writeLog("error", message, meta);
}

export function logWithThrottle(
  level: LogLevel,
  key: string,
  message: string,
  meta?: Record<string, unknown>,
  intervalMs = 30_000
) {
  const now = Date.now();
  const last = lastLogAt.get(key) ?? 0;
  if (now - last < intervalMs) return;
  lastLogAt.set(key, now);
  writeLog(level, message, meta);
}

export function logApiError(req: Request, message: string, error: unknown, extra?: Record<string, unknown>) {
  const context = getRequestContext(req);
  logError(message, { ...context, error: safeError(error), ...(extra ?? {}) });
}
