import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";

type Params = { pageId: string };

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { error: apiErrorJson("not_found", 404) };
  return { error: null };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { error } = await requireOwner(pageId, req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? undefined;
  const limitRaw = searchParams.get("limit");
  const cursorRaw = searchParams.get("cursor");

  const limit = z.number().int().min(1).max(200).catch(50).parse(limitRaw ? Number(limitRaw) : undefined);
  const cursor = cursorRaw ? new Date(cursorRaw) : null;

  const logs = await prisma.pageAuditLog.findMany({
    where: {
      page_id: pageId,
      ...(action ? { action } : {}),
      ...(cursor ? { created_at: { lt: cursor } } : {}),
    },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  const nextCursor = logs.length ? logs[logs.length - 1].created_at.toISOString() : null;

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      targetType: l.target_type,
      targetId: l.target_id,
      actorUserId: l.actor_user_id,
      actorAnonId: l.actor_anon_id,
      meta: l.meta,
      createdAt: l.created_at.toISOString(),
    })),
    nextCursor,
  });
}
