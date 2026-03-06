import { NextResponse } from "next/server";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { prisma } from "@/lib/db";
import { createSsoConnection, listSsoConnections } from "@/lib/app-sso";
import { logAppAudit } from "@/lib/app-audit";

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("not_found", 404) };
  return { page, user, anonUserId, error: null };
}

export const GET = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const { error } = await requireOwner(pageId, req);
    if (error) return error;
    const connections = await listSsoConnections(pageId);
    return NextResponse.json({ connections });
  }
);

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const { error, user, anonUserId } = await requireOwner(pageId, req);
    if (error) return error;
    const body = await safeParseBody(req);
    if (!body) return NextResponse.json({ error: "body_required" }, { status: 400 });

    const connection = await createSsoConnection(pageId, body);
    await logAppAudit({
      pageId,
      action: "sso_connection_create",
      targetType: "sso_connection",
      targetId: connection.id,
      meta: { provider: connection.provider, name: connection.name },
      actor: { userId: user!.id, anonId: anonUserId! },
    });

    return NextResponse.json({ ok: true, connection });
  }
);
