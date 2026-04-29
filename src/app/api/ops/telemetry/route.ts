import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/admin-session";
import { buildOpsTelemetrySnapshot } from "@/lib/ops-telemetry";
import { expireStalePages } from "@/lib/expire";

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

  await expireStalePages();

  const snapshot = buildOpsTelemetrySnapshot({ windowHours, limit });
  const [openReports, liveCount] = await Promise.all([
    prisma.report.count({ where: { status: "open" } }),
    prisma.page.count({
      where: {
        status: "live",
        is_deleted: false,
        live_expires_at: { gt: new Date() },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    snapshot,
    overview: {
      openReports,
      liveCount,
    },
  });
}
