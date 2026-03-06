import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/logger";
import { apiErrorJson } from "@/lib/api-error";
import { logAvailability } from "@/lib/availability-log";
import { withNoStore } from "@/lib/cache-policy";

/** §29.10 모니터링·헬스체크 — GET /api/health */
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    logAvailability({
      ts: new Date().toISOString(),
      ok: true,
      db_ok: true,
      latency_ms: Date.now() - startedAt,
      source: "public",
    });
    const res = NextResponse.json({ ok: true });
    return withNoStore(res);
  } catch (e) {
    logError("health check failed", { error: String(e) });
    logAvailability({
      ts: new Date().toISOString(),
      ok: false,
      db_ok: dbOk,
      latency_ms: Date.now() - startedAt,
      source: "public",
      meta: { error: String(e) },
    });
    const res = apiErrorJson("service_unavailable", 503);
    return withNoStore(res);
  }
}
