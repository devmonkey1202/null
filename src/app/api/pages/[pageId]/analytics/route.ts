import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { expireStalePages } from "@/lib/expire";
import { apiErrorJson } from "@/lib/api-error";

type Params = { pageId: string };

/**
 * §31 대시보드·분석: 기간별 집계.
 * GET ?period=today|7d|30d
 * - summary: 해당 기간 방문 수, 클릭 수, 평균 체류(ms), 이탈률
 * - daily: 일별 { date (YYYY-MM-DD), visits, clicks } 추이용
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  await expireStalePages();

  const { pageId } = await context.params;
  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "7d";
  if (!["today", "7d", "30d"].includes(period)) {
    return apiErrorJson("invalid_period", 400);
  }

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { owner: true },
  });
  if (!page || page.is_deleted) return apiErrorJson("not_found", 404);

  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId || page.owner.anon_id !== anonUserId) {
    if (page.is_hidden) return apiErrorJson("not_found", 404);
    const isLive = page.status === "live" && page.live_expires_at && page.live_expires_at > new Date();
    const isDeployed = page.deployed_at != null;
    if (!isLive && !isDeployed) return apiErrorJson("not_found", 404);
  }
  const isOwner = anonUserId && page.owner.anon_id === anonUserId;
  if (!isOwner) return apiErrorJson("forbidden", 403);

  const now = new Date();
  let from: Date;
  if (period === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  } else if (period === "7d") {
    from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else {
    from = new Date(now);
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  }

  const [sessionCount, clickCount, sessionsForDuration, dailySessions, dailyClicks] = await Promise.all([
    prisma.liveSession.count({
      where: { page_id: pageId, started_at: { gte: from } },
    }),
    prisma.event.count({
      where: {
        page_id: pageId,
        type: "click",
        ts: { gte: from },
      },
    }),
    prisma.liveSession.findMany({
      where: { page_id: pageId, started_at: { gte: from }, ended_at: { not: null } },
      select: { duration_ms: true },
    }),
    period === "today"
      ? Promise.resolve([])
      : prisma.$queryRaw<{ d: Date; c: bigint }[]>`
          SELECT date_trunc('day', "started_at")::date AS d, count(*)::bigint AS c
          FROM "LiveSession"
          WHERE "page_id" = ${pageId} AND "started_at" >= ${from}
          GROUP BY date_trunc('day', "started_at")
          ORDER BY 1 ASC
        `,
    period === "today"
      ? Promise.resolve([])
      : prisma.$queryRaw<{ d: Date; c: bigint }[]>`
          SELECT date_trunc('day', "ts")::date AS d, count(*)::bigint AS c
          FROM "Event"
          WHERE "page_id" = ${pageId} AND "type" = 'click' AND "ts" >= ${from}
          GROUP BY date_trunc('day', "ts")
          ORDER BY 1 ASC
        `,
  ]);

  const totalDurationMs = sessionsForDuration.reduce((s, x) => s + (x.duration_ms ?? 0), 0);
  const avgDurationMs = sessionsForDuration.length
    ? totalDurationMs / sessionsForDuration.length
    : 0;
  const bounceCount = sessionsForDuration.filter((x) => (x.duration_ms ?? 0) < 5000).length;
  const bounceRate = sessionsForDuration.length
    ? bounceCount / sessionsForDuration.length
    : 0;

  const dayMap = new Map<string, { visits: number; clicks: number }>();
  for (const row of dailySessions) {
    const d = row.d instanceof Date ? row.d : new Date(row.d as unknown as string);
    const key = d.toISOString().slice(0, 10);
    const cur = dayMap.get(key) ?? { visits: 0, clicks: 0 };
    cur.visits = Number(row.c);
    dayMap.set(key, cur);
  }
  for (const row of dailyClicks) {
    const d = row.d instanceof Date ? row.d : new Date(row.d as unknown as string);
    const key = d.toISOString().slice(0, 10);
    const cur = dayMap.get(key) ?? { visits: 0, clicks: 0 };
    cur.clicks = Number(row.c);
    dayMap.set(key, cur);
  }

  const days: { date: string; visits: number; clicks: number }[] = [];
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  if (period === "today") {
    const key = from.toISOString().slice(0, 10);
    days.push({
      date: key,
      visits: sessionCount,
      clicks: clickCount,
    });
  } else {
    const walk = new Date(from);
    while (walk <= to) {
      const key = walk.toISOString().slice(0, 10);
      days.push({
        date: key,
        visits: dayMap.get(key)?.visits ?? 0,
        clicks: dayMap.get(key)?.clicks ?? 0,
      });
      walk.setDate(walk.getDate() + 1);
    }
  }

  return NextResponse.json({
    period,
    from: from.toISOString(),
    to: now.toISOString(),
    summary: {
      visits: sessionCount,
      clicks: clickCount,
      avg_duration_ms: Math.round(avgDurationMs),
      bounce_rate: Math.round(bounceRate * 100) / 100,
    },
    daily: days,
  });
}
