import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin-session";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type AvailabilityEntry = {
  ts: string;
  ok: boolean;
  db_ok?: boolean;
  latency_ms: number;
  source: "public" | "ops";
};

function readTail(filePath: string, limit: number) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  return lines.slice(Math.max(0, lines.length - limit));
}

export async function GET(req: Request) {
  const gate = await requireAdminAccess(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.code }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const windowHoursRaw = Number(searchParams.get("window_hours") ?? 24);
  const windowHours = Number.isFinite(windowHoursRaw) ? Math.max(1, Math.min(168, windowHoursRaw)) : 24;
  const limitRaw = Number(searchParams.get("limit") ?? 5000);
  const limit = Number.isFinite(limitRaw) ? Math.max(100, Math.min(20000, limitRaw)) : 5000;

  const logFile = join(process.cwd(), "logs", "availability.log");
  const lines = readTail(logFile, limit);
  const now = Date.now();
  const since = now - windowHours * 60 * 60 * 1000;

  const entries = lines
    .map((line) => {
      try {
        return JSON.parse(line) as AvailabilityEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is AvailabilityEntry => Boolean(entry && entry.ts));

  const recent = entries.filter((entry) => {
    const ts = Date.parse(entry.ts);
    return Number.isFinite(ts) && ts >= since;
  });

  const total = recent.length;
  const okCount = recent.filter((entry) => entry.ok).length;
  const dbOkCount = recent.filter((entry) => entry.db_ok === true).length;
  const avgLatency =
    total > 0
      ? Math.round(recent.reduce((acc, entry) => acc + (entry.latency_ms || 0), 0) / total)
      : null;

  return NextResponse.json({
    ok: true,
    window_hours: windowHours,
    total,
    ok_count: okCount,
    ok_rate: total > 0 ? Number((okCount / total).toFixed(4)) : null,
    db_ok_count: dbOkCount,
    db_ok_rate: total > 0 ? Number((dbOkCount / total).toFixed(4)) : null,
    avg_latency_ms: avgLatency,
    latest: recent.at(-1) ?? null,
  });
}
