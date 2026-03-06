import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string; id: string };

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).trim().optional(),
  done: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const PATCH = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId, id } = await context.params;
  if (!pageId || !id) return apiErrorJson("bad_params", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  const raw = await req.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return apiErrorJson("invalid_body", 400);

  const existing = await prisma.todo.findFirst({
    where: { id, page_id: pageId },
  });
  if (!existing) return apiErrorJson("not_found", 404);

  const todo = await prisma.todo.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.done !== undefined && { done: parsed.data.done }),
      ...(parsed.data.sort_order !== undefined && { sort_order: parsed.data.sort_order }),
    },
  });

  await logPageAudit({
    pageId,
    action: "todo_update",
    targetType: "todo",
    targetId: todo.id,
    meta: { changed: Object.keys(parsed.data) },
    actor: { userId: user.id, anonId: anonUserId },
  });

  return NextResponse.json({
    todo: {
      id: todo.id,
      pageId: todo.page_id,
      title: todo.title,
      done: todo.done,
      sortOrder: todo.sort_order,
      createdAt: todo.created_at.toISOString(),
      updatedAt: todo.updated_at.toISOString(),
    },
  });
});

export const DELETE = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId, id } = await context.params;
  if (!pageId || !id) return apiErrorJson("bad_params", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  const existing = await prisma.todo.findFirst({
    where: { id, page_id: pageId },
  });
  if (!existing) return apiErrorJson("not_found", 404);

  await prisma.todo.delete({ where: { id } });
  await logPageAudit({
    pageId,
    action: "todo_delete",
    targetType: "todo",
    targetId: id,
    meta: null,
    actor: { userId: user.id, anonId: anonUserId },
  });
  return NextResponse.json({ ok: true });
});
