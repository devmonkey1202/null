import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { logSystemEvent } from "@/lib/system-log";

const MAX_PER_MINUTE = 30;

function pickString(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  return value.length > max ? value.slice(0, max) : value;
}

export async function POST(req: Request) {
  const rl = await checkRateLimit(req, MAX_PER_MINUTE);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limit_exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const payload = {
    message: pickString(body.message, 4000) ?? "client_error",
    name: pickString(body.name) ?? null,
    stack: pickString(body.stack, 8000) ?? null,
    component_stack: pickString(body.component_stack, 8000) ?? null,
    source: pickString(body.source) ?? null,
    url: pickString(body.url, 2000) ?? null,
    user_agent: pickString(body.user_agent, 400) ?? null,
  };

  logSystemEvent("error", "client_error", payload, "client");

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
