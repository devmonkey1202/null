import { NextResponse } from "next/server";
import os from "node:os";
import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/admin-session";
import { logAvailability } from "@/lib/availability-log";

export async function GET(req: Request) {
  const gate = await requireAdminAccess(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.code }, { status: 401 });
  }

  const startedAt = Date.now();
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbOk = false;
    dbError = err instanceof Error ? err.message : "db_error";
  }

  const memory = process.memoryUsage();
  const load = os.loadavg();
  logAvailability({
    ts: new Date().toISOString(),
    ok: dbOk,
    db_ok: dbOk,
    latency_ms: Date.now() - startedAt,
    source: "ops",
    meta: dbError ? { error: dbError } : undefined,
  });

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime_sec: Math.round(process.uptime()),
    db: { ok: dbOk, error: dbError },
    memory: {
      rss: memory.rss,
      heap_used: memory.heapUsed,
      heap_total: memory.heapTotal,
    },
    load,
    platform: process.platform,
    node: process.version,
  });
}
