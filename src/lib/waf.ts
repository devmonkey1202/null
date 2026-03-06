import { prisma } from "@/lib/db";
import { getClientIp, hashIp } from "@/lib/request";
import { logSecurityEvent } from "@/lib/security-log";

type WafDecision =
  | { allowed: true }
  | { allowed: false; status: number; error: string; message: string; detail?: Record<string, unknown> };

const DEFAULT_MAX_BODY_BYTES = 2_000_000;
const DEFAULT_UA_BLOCK = /(sqlmap|acunetix|nikto|dirbuster|masscan|nmap|nessus|fuzz)/i;
const DEFAULT_SKIP_PREFIXES = ["/api/health", "/api/ops/health"];

function parseBool(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function requestPath(req: Request) {
  try {
    return new URL(req.url).pathname;
  } catch {
    return req.url;
  }
}

function shouldSkipPath(path: string) {
  const extra = process.env.WAF_SKIP_PATHS
    ? process.env.WAF_SKIP_PATHS.split(",").map((v) => v.trim()).filter(Boolean)
    : [];
  const prefixes = [...DEFAULT_SKIP_PREFIXES, ...extra];
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function resolveUaRegex() {
  const raw = process.env.WAF_BLOCK_UA_REGEX;
  if (!raw) return DEFAULT_UA_BLOCK;
  try {
    return new RegExp(raw, "i");
  } catch {
    return DEFAULT_UA_BLOCK;
  }
}

function block(
  req: Request,
  error: string,
  status: number,
  message: string,
  detail?: Record<string, unknown>
): WafDecision {
  logSecurityEvent({ action: "waf_block", req, meta: { error, status, detail } });
  return { allowed: false, status, error, message, detail };
}

export async function checkWaf(req: Request): Promise<WafDecision> {
  if (!parseBool(process.env.WAF_ENABLED, false)) return { allowed: true };

  const path = requestPath(req);
  if (shouldSkipPath(path)) return { allowed: true };

  if (parseBool(process.env.WAF_CHECK_BODY_SIZE, true)) {
    const maxBytes = parseNumber(process.env.WAF_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
    const lengthRaw = req.headers.get("content-length");
    const length = lengthRaw ? Number(lengthRaw) : 0;
    if (Number.isFinite(length) && length > maxBytes) {
      return block(req, "waf_body_too_large", 413, "요청 본문이 너무 큽니다.", {
        max_bytes: maxBytes,
        length,
      });
    }
  }

  if (parseBool(process.env.WAF_CHECK_UA, true)) {
    const ua = req.headers.get("user-agent") ?? "";
    const uaRegex = resolveUaRegex();
    if (uaRegex && uaRegex.test(ua)) {
      return block(req, "waf_ua_blocked", 403, "요청이 차단되었습니다.", { user_agent: ua });
    }
  }

  if (parseBool(process.env.WAF_CHECK_IP_BLOCKS, true)) {
    const ip = getClientIp(req);
    if (ip) {
      const ipHash = hashIp(ip);
      const record = await prisma.ipBlock.findFirst({
        where: {
          ip_hash: ipHash,
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
        select: { reason: true, expires_at: true },
      });
      if (record) {
        return block(req, "waf_ip_blocked", 403, "요청이 차단되었습니다.", {
          reason: record.reason ?? "blocked",
          expires_at: record.expires_at?.toISOString() ?? null,
        });
      }
    }
  }

  return { allowed: true };
}
