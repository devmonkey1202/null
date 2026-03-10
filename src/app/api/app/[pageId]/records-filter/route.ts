import { handleAppRecordQuery } from "@/lib/app-record-query";
import { apiErrorJson } from "@/lib/api-error";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { ensureDevCollections, readEnvFromRequest, resolveAppEnv } from "@/lib/app-env";

type Params = { pageId: string };

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);
  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true },
  });
  const isOwner = Boolean(user && page?.owner_id === user.id);
  const env = await resolveAppEnv(pageId, { isOwner, requestEnv: readEnvFromRequest(req) });
  if (env === "dev" && isOwner) {
    await ensureDevCollections(pageId);
  }
  return handleAppRecordQuery(req, pageId, null, env);
}
