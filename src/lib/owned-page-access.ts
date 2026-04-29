import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";

export async function resolveOwnedPageAccess(req: Request, pageId: string) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) {
    return { anonUserId: null as string | null, user: null as null, page: null as null };
  }
  const user = await prisma.user.findUnique({
    where: { anon_id: anonUserId },
    select: { id: true, anon_id: true },
  });
  if (!user) {
    return { anonUserId, user: null as null, page: null as null };
  }
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true, owner_id: true },
  });
  return { anonUserId, user, page };
}
