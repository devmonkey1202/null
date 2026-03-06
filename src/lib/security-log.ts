import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getClientIp } from "@/lib/rate-limit";

type SecurityActor = {
  userId?: string | null;
  appUserId?: string | null;
  adminId?: string | null;
  anonId?: string | null;
};

type SecurityEvent = {
  ts: string;
  action: string;
  actor?: SecurityActor;
  ip?: string;
  user_agent?: string;
  path?: string;
  meta?: Record<string, unknown>;
};

const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "security.log");

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function requestPath(req?: Request): string | undefined {
  if (!req) return undefined;
  try {
    return new URL(req.url).pathname;
  } catch {
    return req.url;
  }
}

export function logSecurityEvent(input: {
  action: string;
  req?: Request;
  actor?: SecurityActor;
  meta?: Record<string, unknown>;
}) {
  try {
    ensureLogDir();
    const entry: SecurityEvent = {
      ts: new Date().toISOString(),
      action: input.action,
      actor: input.actor,
      ip: input.req ? getClientIp(input.req) : undefined,
      user_agent: input.req?.headers.get("user-agent") ?? undefined,
      path: requestPath(input.req),
      meta: input.meta,
    };
    appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
  } catch {
    // fail-safe: avoid throwing in logging path
  }
}
