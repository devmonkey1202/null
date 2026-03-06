import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";

type Params = { pageId: string };

/** GET: 페이지별 알림 목록 (수신자 = 현재 사용자/anon). unread_only, limit 지원 */
export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread_only") === "true";
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));

  const where = {
    page_id: pageId,
    OR: [
      { recipient_user_id: user.id },
      { recipient_anon_id: anonUserId },
    ],
    ...(unreadOnly ? { read_at: null } : {}),
  };

  try {
    const list = await prisma.pageNotification.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
    });
    return NextResponse.json({
      notifications: list.map((n) => ({
      id: n.id,
      type: n.type,
      refId: n.ref_id,
      title: n.title,
      body: n.body,
      readAt: n.read_at?.toISOString() ?? null,
      createdAt: n.created_at.toISOString(),
    })),
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (err instanceof TypeError && msg.includes("findMany")) {
      return NextResponse.json({ notifications: [] });
    }
    throw err;
  }
});
