import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { apiErrorJson } from "@/lib/api-error";
import { appUserRecipientKey, markServiceNotificationRead } from "@/lib/service-notifications";

type Params = { pageId: string; id: string };

async function getPageAccess(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner: { select: { anon_id: true } } },
  });
  const appUser = page ? await resolveAppUserFromRequest(pageId, req) : null;
  const isOwner = Boolean(page && anonUserId && page.owner.anon_id === anonUserId);
  return { page, appUser, anonUserId, isOwner };
}

export async function PATCH(req: Request, context: { params: Promise<Params> }) {
  const { pageId, id } = await context.params;
  if (!pageId || !id) return apiErrorJson("bad_request", 400);

  const { page, appUser, anonUserId, isOwner } = await getPageAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);
  if (!isOwner && !appUser) return apiErrorJson("permission_denied", 403);

  const recipientKey = appUser?.id ? appUserRecipientKey(appUser.id) : isOwner && anonUserId ? `owner:${anonUserId}` : "";
  if (!recipientKey) return apiErrorJson("permission_denied", 403);

  const result = await markServiceNotificationRead({
    pageId,
    notificationId: id,
    recipientKey,
    actor: {
      anonId: anonUserId,
      appUserId: appUser?.id,
    },
  });
  if (!result.ok) return apiErrorJson("not_found", 404);
  return NextResponse.json(result);
}
