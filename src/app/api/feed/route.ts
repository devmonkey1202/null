import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expireStalePages } from "@/lib/expire";
import { apiErrorJson } from "@/lib/api-error";
import { resolveAnonUserId } from "@/lib/anon";
import { ensureAnonUser } from "@/lib/anon";
import { logApiError } from "@/lib/logger";

/** §29.4 정렬(신규/인기/시간순) 식·필드: tab=new → live_started_at desc; tab=popular → popularScore(quality·decay·abusePenalty); tab=time → live_expires_at asc, live_started_at desc */
/** PROJECT.md 2-5 인기 정렬: 체류·CTR·이탈·시간 감쇠·어뷰징 패널티 */
const POPULAR_K_DECAY = 8; // 시간 감쇠 k (6~12 권장)
const T_WINSORIZE_SEC = 600; // 체류 상한(초)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function popularScore(page: {
  total_visits: number;
  unique_sessions: number;
  avg_duration_ms: number;
  total_clicks: number;
  bounce_rate: number;
  upvote_count: number;
  abuse_score: number;
  live_started_at: Date | null;
  live_expires_at: Date | null;
}, now: Date): number {
  const V = page.total_visits;
  const U = page.unique_sessions;
  const T_sec = Math.min(page.avg_duration_ms / 1000, T_WINSORIZE_SEC);
  const CTR = V > 0 ? page.total_clicks / V : 0;
  const B = page.bounce_rate;
  const R = page.upvote_count;
  const A = page.abuse_score;

  const quality =
    Math.log(1 + U) +
    0.6 * Math.log(1 + V) +
    0.04 * T_sec +
    2.5 * CTR -
    1.8 * B +
    0.2 * Math.log(1 + R);

  const abusePenalty = clamp(1 - A, 0.2, 1);

  let decay: number;
  if (page.live_expires_at && page.live_expires_at > now) {
    decay = 1; // LIVE 중 부스트(감쇠 없음)
  } else if (page.live_started_at) {
    const ageHours = (now.getTime() - page.live_started_at.getTime()) / (1000 * 60 * 60);
    decay = Math.exp(-ageHours / POPULAR_K_DECAY);
  } else {
    decay = 0.5;
  }

  return quality * decay * abusePenalty;
}

export async function GET(req: Request) {
  try {
    await expireStalePages();
  } catch (e) {
    logApiError(req, "feed expireStalePages failed", e);
  }

  try {
    const url = new URL(req.url);
    const tab = url.searchParams.get("tab") ?? "new";
    const endingSoon = url.searchParams.get("ending_soon") === "1";
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? "60", 10)), 100);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const where: NonNullable<Parameters<typeof prisma.page.findMany>[0]>["where"] = {
      status: "live" as const,
      is_hidden: false,
      is_deleted: false,
      live_expires_at: { gt: now },
    };
    if (endingSoon) {
      where.live_expires_at = { gt: now, lte: oneHourFromNow };
    }
    if (q.length > 0) {
      const anonNum = parseInt(q, 10);
      where.OR = [
        { id: q },
        { title: { contains: q, mode: "insensitive" } },
        ...(Number.isNaN(anonNum) ? [] : [{ anon_number: anonNum }]),
      ];
    }

    let pages: Awaited<ReturnType<typeof prisma.page.findMany>>;

    if (tab === "popular") {
      const all = await prisma.page.findMany({
        where,
        take: 200,
      });
      const withScore = all.map((p) => ({ page: p, score: popularScore(p, now) }));
      withScore.sort((a, b) => b.score - a.score);
      pages = withScore.slice(offset, offset + limit).map((x) => x.page);
    } else if (tab === "time") {
      pages = await prisma.page.findMany({
        where,
        orderBy: [
          { live_expires_at: "asc" as const },
          { live_started_at: "desc" as const },
        ],
        take: limit,
        skip: offset,
      });
    } else {
      pages = await prisma.page.findMany({
        where,
        orderBy: [{ live_started_at: "desc" as const }],
        take: limit,
        skip: offset,
      });
    }

    const pageIds = pages.map((p) => p.id);
    const viewerCounts =
      pageIds.length > 0
        ? await prisma.liveSession.groupBy({
            by: ["page_id"],
            where: { page_id: { in: pageIds }, ended_at: null },
            _count: { id: true },
          })
        : [];
    const viewerMap = new Map(viewerCounts.map((v) => [v.page_id, v._count.id]));

    /** §29.4 추천 취소·중복 방지: 로그인/익명 사용자가 추천한 작품 id 목록(피드에서 토글 표시용) */
    let upvoted_page_ids: string[] = [];
    try {
      const anonUserId = await resolveAnonUserId(req);
      if (anonUserId && pageIds.length > 0) {
        const user = await ensureAnonUser(anonUserId);
        if (user) {
          const list = await prisma.upvote.findMany({
            where: { user_id: user.id, page_id: { in: pageIds } },
            select: { page_id: true },
          });
          upvoted_page_ids = list.map((u) => u.page_id);
        }
      }
    } catch {
      // non-blocking
    }

    return NextResponse.json({
      items: pages.map((page) => ({
        id: page.id,
        title: page.title,
        anon_number: page.anon_number,
        live_started_at: page.live_started_at,
        live_expires_at: page.live_expires_at,
        total_visits: page.total_visits,
        avg_duration_ms: page.avg_duration_ms,
        total_clicks: page.total_clicks,
        upvote_count: page.upvote_count,
        bounce_rate: page.bounce_rate,
        snapshot_thumbnail: page.snapshot_thumbnail ?? null,
        live_viewer_count: viewerMap.get(page.id) ?? 0,
      })),
      nextOffset: offset + pages.length,
      limit,
      upvoted_page_ids,
    });
  } catch (error) {
    logApiError(req, "feed GET failed", error);
    return apiErrorJson("feed_unavailable", 500);
  }
}
