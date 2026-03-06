import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string; id: string };

const patchBodySchema = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export async function PATCH(req: Request, context: { params: Promise<Params> }) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId, id } = await context.params;
  if (!pageId || !id) return apiErrorJson("bad_params", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  const existing = await prisma.kanbanColumn.findFirst({
    where: { id, page_id: pageId },
  });
  if (!existing) return apiErrorJson("not_found", 404);

  const raw = await req.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return apiErrorJson("invalid_body", 400);

  const column = await prisma.kanbanColumn.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.sort_order !== undefined && { sort_order: parsed.data.sort_order }),
    },
  });

  await logPageAudit({
    pageId,
    action: "kanban_column_update",
    targetType: "kanban_column",
    targetId: column.id,
    meta: { changed: Object.keys(parsed.data) },
    actor: { userId: user.id, anonId: anonUserId },
  });

  return NextResponse.json({
    column: {
      id: column.id,
      pageId: column.page_id,
      title: column.title,
      sortOrder: column.sort_order,
      createdAt: column.created_at.toISOString(),
      updatedAt: column.updated_at.toISOString(),
    },
  });
}

export async function DELETE(req: Request, context: { params: Promise<Params> }) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId, id } = await context.params;
  if (!pageId || !id) return apiErrorJson("bad_params", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  const existing = await prisma.kanbanColumn.findFirst({
    where: { id, page_id: pageId },
  });
  if (!existing) return apiErrorJson("not_found", 404);

  await prisma.kanbanColumn.delete({ where: { id } });
  await logPageAudit({
    pageId,
    action: "kanban_column_delete",
    targetType: "kanban_column",
    targetId: id,
    meta: null,
    actor: { userId: user.id, anonId: anonUserId },
  });
  return NextResponse.json({ ok: true });
}
