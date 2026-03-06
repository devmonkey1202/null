import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId, ensureAnonUser } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { getCollabInviteFromRequest, isCollabInviteValid } from "@/lib/collab";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string };

function canViewPage(
  page: { owner_id: string; is_hidden: boolean; status: string; live_expires_at: Date | null; collab_invite_code: string | null; collab_invite_enabled: boolean },
  viewerUserId: string | null,
  allowInvite: boolean
) {
  if (allowInvite) return true;
  if (page.owner_id === viewerUserId) return true;
  if (page.is_hidden) return false;
  if (page.status !== "live") return false;
  if (page.live_expires_at && page.live_expires_at <= new Date()) return false;
  return true;
}

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, is_hidden: true, status: true, live_expires_at: true, collab_invite_code: true, collab_invite_enabled: true },
  });
  if (!page) return apiErrorJson("not_found", 404);

  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const viewerId = user?.id ?? null;
  const collabInvite = getCollabInviteFromRequest(req);
  const allowInvite = isCollabInviteValid(collabInvite, {
    collab_invite_code: page.collab_invite_code ?? null,
    collab_invite_enabled: page.collab_invite_enabled ?? false,
  });
  if (!canViewPage(page, viewerId, allowInvite)) return apiErrorJson("not_found", 404);

  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get("nodeId") ?? undefined;
  const resolved = searchParams.get("resolved");
  const resolvedFilter = resolved === "true" ? true : resolved === "false" ? false : undefined;

  const comments = await prisma.comment.findMany({
    where: {
      page_id: pageId,
      parent_id: null,
      ...(nodeId != null ? { node_id: nodeId } : {}),
      ...(resolvedFilter !== undefined ? { resolved: resolvedFilter } : {}),
    },
    include: {
      user: { select: { id: true, anon_id: true, email: true } },
      replies: {
        include: { user: { select: { id: true, anon_id: true, email: true } } },
        orderBy: { created_at: "asc" },
      },
    },
    orderBy: { created_at: "asc" },
  });

  const mapAuthor = (u: { email: string | null; anon_id: string }) =>
    u.email ? u.email : `Anonymous (${u.anon_id.slice(0, 8)})`;
  const toPayload = (c: (typeof comments)[0]) => ({
    id: c.id,
    pageId: c.page_id,
    nodeId: c.node_id,
    userId: c.user_id,
    author: mapAuthor(c.user),
    x: c.x,
    y: c.y,
    content: c.content,
    parentId: c.parent_id,
    resolved: c.resolved,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    replies: c.replies.map((r) => ({
      id: r.id,
      pageId: r.page_id,
      nodeId: r.node_id,
      userId: r.user_id,
      author: mapAuthor(r.user),
      x: r.x,
      y: r.y,
      content: r.content,
      parentId: r.parent_id,
      resolved: r.resolved,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });

  return NextResponse.json({ comments: comments.map(toPayload) });
});

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_user_id_required", 401);

  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const user = await ensureAnonUser(anonUserId);
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, is_hidden: true, status: true, live_expires_at: true, collab_invite_code: true, collab_invite_enabled: true },
  });
  if (!page) return apiErrorJson("not_found", 404);

  const collabInvite = getCollabInviteFromRequest(req);
  const allowInvite = isCollabInviteValid(collabInvite, {
    collab_invite_code: page.collab_invite_code ?? null,
    collab_invite_enabled: page.collab_invite_enabled ?? false,
  });
  if (!canViewPage(page, user.id, allowInvite)) return apiErrorJson("forbidden", 403);

  const parsed = await parseJsonBody(
    req,
    z
      .object({
        x: z.number().optional(),
        y: z.number().optional(),
        content: z.string().optional(),
        nodeId: z.string().optional(),
        parentId: z.string().optional(),
      })
      .passthrough()
  );
  if (parsed.error) return parsed.error;

  const x = typeof parsed.data.x === "number" ? parsed.data.x : 0;
  const y = typeof parsed.data.y === "number" ? parsed.data.y : 0;
  const content = typeof parsed.data.content === "string" ? parsed.data.content.trim().slice(0, 10000) : "";
  const nodeId = typeof parsed.data.nodeId === "string" ? parsed.data.nodeId : null;
  const parentId = typeof parsed.data.parentId === "string" ? parsed.data.parentId : null;

  if (!content) return apiErrorJson("content_required", 400);

  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, page_id: pageId },
      select: { id: true },
    });
    if (!parent) return apiErrorJson("parent_not_found", 400);
  }

  const comment = await prisma.comment.create({
    data: {
      page_id: pageId,
      node_id: nodeId,
      user_id: user.id,
      x,
      y,
      content,
      parent_id: parentId,
    },
    include: { user: { select: { id: true, anon_id: true, email: true } } },
  });

  await logPageAudit({
    pageId,
    action: "comment_create",
    targetType: "comment",
    targetId: comment.id,
    meta: { node_id: nodeId, parent_id: parentId },
    actor: { userId: user.id, anonId: anonUserId },
  });

  const author = comment.user.email ? comment.user.email : `Anonymous (${comment.user.anon_id.slice(0, 8)})`;
  return NextResponse.json({
    ok: true,
    comment: {
      id: comment.id,
      pageId: comment.page_id,
      nodeId: comment.node_id,
      userId: comment.user_id,
      author,
      x: comment.x,
      y: comment.y,
      content: comment.content,
      parentId: comment.parent_id,
      resolved: comment.resolved,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      replies: [],
    },
  });
});
