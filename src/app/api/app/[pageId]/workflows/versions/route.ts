import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";

type Params = { pageId: string };

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { userId: null as null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { userId: null as null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { userId: null as null, error: apiErrorJson("not_found", 404) };
  return { userId: user.id, error: null };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const workflowId = searchParams.get("workflowId");
  if (!workflowId) return apiErrorJson("workflow_id_required", 400);

  const limitRaw = searchParams.get("limit");
  const cursorRaw = searchParams.get("cursor");
  const limit = z.number().int().min(1).max(200).catch(50).parse(limitRaw ? Number(limitRaw) : undefined);
  const cursor = cursorRaw ? new Date(cursorRaw) : null;

  const versions = await prisma.appWorkflowVersion.findMany({
    where: {
      page_id: pageId,
      workflow_id: workflowId,
      ...(cursor ? { created_at: { lt: cursor } } : {}),
    },
    orderBy: { version: "desc" },
    take: limit,
  });

  const nextCursor = versions.length ? versions[versions.length - 1].created_at.toISOString() : null;

  return NextResponse.json({
    versions: versions.map((v) => ({
      id: v.id,
      workflowId: v.workflow_id,
      name: v.name,
      trigger: v.trigger,
      steps: v.steps,
      enabled: v.enabled,
      version: v.version,
      actorUserId: v.actor_user_id,
      actorAppUserId: v.actor_app_user_id,
      actorAnonId: v.actor_anon_id,
      createdAt: v.created_at.toISOString(),
    })),
    nextCursor,
  });
}