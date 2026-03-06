import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId, ensureAnonUser } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string; commentId: string };

export async function PATCH(req: Request, context: { params: Promise<Params> }) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_user_id_required", 401);

  const { pageId, commentId } = await context.params;
  if (!pageId || !commentId) return apiErrorJson("bad_params", 400);

  const user = await ensureAnonUser(anonUserId);
  if (!user) return apiErrorJson("user_not_found", 404);

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, page_id: pageId },
    include: { page: { select: { owner_id: true } } },
  });
  if (!comment) return apiErrorJson("not_found", 404);

  const canEdit = comment.user_id === user.id || comment.page.owner_id === user.id;
  if (!canEdit) return apiErrorJson("forbidden", 403);

  const parsed = await parseJsonBody(
    req,
    z
      .object({
        content: z.string().optional(),
        resolved: z.boolean().optional(),
      })
      .passthrough()
  );
  if (parsed.error) return parsed.error;

  const updates: { content?: string; resolved?: boolean } = {};
  if (typeof parsed.data.content === "string") updates.content = parsed.data.content.trim().slice(0, 10000);
  if (typeof parsed.data.resolved === "boolean") updates.resolved = parsed.data.resolved;

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: updates,
    include: { user: { select: { id: true, anon_id: true, email: true } } },
  });

  await logPageAudit({
    pageId,
    action: "comment_update",
    targetType: "comment",
    targetId: updated.id,
    meta: { resolved: updated.resolved },
    actor: { userId: user.id, anonId: anonUserId },
  });

  const author = updated.user.email ? updated.user.email : `Anonymous (${updated.user.anon_id.slice(0, 8)})`;
  return NextResponse.json({
    ok: true,
    comment: {
      id: updated.id,
      pageId: updated.page_id,
      nodeId: updated.node_id,
      userId: updated.user_id,
      author,
      x: updated.x,
      y: updated.y,
      content: updated.content,
      parentId: updated.parent_id,
      resolved: updated.resolved,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
  });
}

export async function DELETE(req: Request, context: { params: Promise<Params> }) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_user_id_required", 401);

  const { pageId, commentId } = await context.params;
  if (!pageId || !commentId) return apiErrorJson("bad_params", 400);

  const user = await ensureAnonUser(anonUserId);
  if (!user) return apiErrorJson("user_not_found", 404);

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, page_id: pageId },
    include: { page: { select: { owner_id: true } } },
  });
  if (!comment) return apiErrorJson("not_found", 404);

  const canDelete = comment.user_id === user.id || comment.page.owner_id === user.id;
  if (!canDelete) return apiErrorJson("forbidden", 403);

  await prisma.comment.deleteMany({ where: { id: commentId } });
  await logPageAudit({
    pageId,
    action: "comment_delete",
    targetType: "comment",
    targetId: commentId,
    meta: null,
    actor: { userId: user.id, anonId: anonUserId },
  });
  return NextResponse.json({ ok: true });
}
