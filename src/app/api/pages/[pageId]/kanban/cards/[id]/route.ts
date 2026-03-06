import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string; id: string };

const patchBodySchema = z.object({
  column_id: z.string().min(1).optional(),
  title: z.string().min(1).max(2000).trim().optional(),
  body: z.string().max(10000).trim().optional().nullable(),
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

  const existing = await prisma.kanbanCard.findFirst({
    where: { id, page_id: pageId },
  });
  if (!existing) return apiErrorJson("not_found", 404);

  const raw = await req.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return apiErrorJson("invalid_body", 400);

  if (parsed.data.column_id !== undefined) {
    const col = await prisma.kanbanColumn.findFirst({
      where: { id: parsed.data.column_id, page_id: pageId },
    });
    if (!col) return apiErrorJson("not_found", 404, "컬럼을 찾을 수 없습니다.");
  }

  const card = await prisma.kanbanCard.update({
    where: { id },
    data: {
      ...(parsed.data.column_id !== undefined && { column_id: parsed.data.column_id }),
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.body !== undefined && { body: parsed.data.body }),
      ...(parsed.data.sort_order !== undefined && { sort_order: parsed.data.sort_order }),
    },
  });

  await logPageAudit({
    pageId,
    action: "kanban_card_update",
    targetType: "kanban_card",
    targetId: card.id,
    meta: { changed: Object.keys(parsed.data) },
    actor: { userId: user.id, anonId: anonUserId },
  });

  return NextResponse.json({
    card: {
      id: card.id,
      pageId: card.page_id,
      columnId: card.column_id,
      title: card.title,
      body: card.body,
      sortOrder: card.sort_order,
      createdAt: card.created_at.toISOString(),
      updatedAt: card.updated_at.toISOString(),
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

  const existing = await prisma.kanbanCard.findFirst({
    where: { id, page_id: pageId },
  });
  if (!existing) return apiErrorJson("not_found", 404);

  await prisma.kanbanCard.delete({ where: { id } });
  await logPageAudit({
    pageId,
    action: "kanban_card_delete",
    targetType: "kanban_card",
    targetId: id,
    meta: null,
    actor: { userId: user.id, anonId: anonUserId },
  });
  return NextResponse.json({ ok: true });
}
