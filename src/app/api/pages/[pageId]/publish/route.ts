import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveAnonUserId, ensureAnonUser } from "@/lib/anon";
import { canPublishMore } from "@/lib/policy";
import { computeLiveExpiry, expireStalePages, getLiveHours } from "@/lib/expire";
import { resolvePlanFeatures } from "@/lib/plan";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string };

export async function POST(req: Request, context: { params: Promise<Params> }) {
  await expireStalePages();

  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) {
    return apiErrorJson("anon_user_id_required", 401, "anon_id가 필요합니다.");
  }

  const { pageId } = await context.params;
  if (!pageId) {
    return apiErrorJson("bad_page_id", 400);
  }

  const user = await ensureAnonUser(anonUserId);
  if (!user) {
    return apiErrorJson("user_not_found", 404);
  }

  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
  });

  if (!page) {
    return apiErrorJson("not_found", 404);
  }

  if (!page.current_version_id) {
    return apiErrorJson("no_version", 400, "게시할 버전이 없습니다.");
  }

  const now = new Date();
  const liveHours = await getLiveHours();
  const features = resolvePlanFeatures(user.plan);

  const liveCount = await prisma.page.count({
    where: {
      owner_id: user.id,
      status: "live",
      id: { not: page.id },
      live_expires_at: { gt: now },
    },
  });

  if (!canPublishMore({ liveCount, maxLive: features.maxLivePages })) {
    return apiErrorJson(
      "publish_limit_reached",
      403,
      "추가 업로드는 플랜 업그레이드가 필요합니다. 또는 현재 공개 중인 작품을 공개 취소한 후 새 작품을 업로드해 주세요."
    );
  }

  const updated = await prisma.page.update({
    where: { id: page.id },
    data: {
      status: "live",
      live_started_at: now,
      live_expires_at: computeLiveExpiry(now, liveHours),
    },
  });

  await logPageAudit({
    pageId,
    action: "page_publish",
    targetType: "page",
    targetId: updated.id,
    meta: { status: updated.status, live_expires_at: updated.live_expires_at?.toISOString() ?? null },
    actor: { userId: user.id, anonId: anonUserId },
  });

  return NextResponse.json({
    ok: true,
    pageId: updated.id,
    page: updated,
  });
}
