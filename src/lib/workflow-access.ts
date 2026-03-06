import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { apiErrorJson } from "@/lib/api-error";

export type WorkflowActor = {
  userId: string | null;
  anonId: string | null;
  appUserId: string | null;
  isOwner: boolean;
  isAppAdmin: boolean;
};

export async function requireWorkflowAdmin(pageId: string, req: Request): Promise<{
  actor: WorkflowActor | null;
  appUser: { id: string; role: string } | null;
  error: Response | null;
}> {
  const anonUserId = await resolveAnonUserId(req);
  let ownerUserId: string | null = null;
  if (anonUserId) {
    const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
    if (user) {
      const page = await prisma.page.findFirst({
        where: { id: pageId, owner_id: user.id, is_deleted: false },
        select: { id: true },
      });
      if (page) ownerUserId = user.id;
    }
  }

  const appUser = await resolveAppUserFromRequest(pageId, req);
  const isAppAdmin = appUser?.role === "admin";

  if (!ownerUserId && !isAppAdmin) {
    return { actor: null, appUser: appUser ?? null, error: apiErrorJson("permission_denied", 403) };
  }

  return {
    actor: {
      userId: ownerUserId,
      anonId: anonUserId ?? null,
      appUserId: appUser?.id ?? null,
      isOwner: Boolean(ownerUserId),
      isAppAdmin: Boolean(isAppAdmin),
    },
    appUser: appUser ?? null,
    error: null,
  };
}
