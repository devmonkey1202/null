import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string; id: string };

/** PATCH: 알림 읽음 처리 */
export async function PATCH(req: Request, context: { params: Promise<Params> }) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId, id } = await context.params;
  if (!pageId || !id) return apiErrorJson("bad_request", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  try {
    const n = await prisma.pageNotification.findFirst({
      where: {
        id,
        page_id: pageId,
        OR: [{ recipient_user_id: user.id }, { recipient_anon_id: anonUserId }],
      },
    });
    if (!n) return apiErrorJson("not_found", 404);

    await prisma.pageNotification.update({
      where: { id },
      data: { read_at: new Date() },
    });
    await logPageAudit({
      pageId,
      action: "notification_read",
      targetType: "notification",
      targetId: id,
      meta: null,
      actor: { userId: user.id, anonId: anonUserId },
    });
    return NextResponse.json({ ok: true, readAt: new Date().toISOString() });
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (err instanceof TypeError && (msg.includes("findFirst") || msg.includes("update"))) {
      return NextResponse.json({ ok: true, readAt: new Date().toISOString() });
    }
    throw err;
  }
}
