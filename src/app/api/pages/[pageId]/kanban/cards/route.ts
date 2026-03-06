import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string };

const postBodySchema = z.object({
  column_id: z.string().min(1),
  title: z.string().min(1).max(2000).trim(),
  body: z.string().max(10000).trim().optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
});

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const page = await getPageForAsset(pageId, req, user?.id ?? null);
  if (!page) return apiErrorJson("not_found", 404);

  const { searchParams } = new URL(req.url);
  const columnId = searchParams.get("column_id") ?? undefined;

  const cards = await prisma.kanbanCard.findMany({
    where: {
      page_id: pageId,
      ...(columnId ? { column_id: columnId } : {}),
    },
    orderBy: [{ column_id: "asc" }, { sort_order: "asc" }],
  });

  return NextResponse.json({
    cards: cards.map((c) => ({
      id: c.id,
      pageId: c.page_id,
      columnId: c.column_id,
      title: c.title,
      body: c.body,
      sortOrder: c.sort_order,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
    })),
  });
});

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  const raw = await req.json().catch(() => ({}));
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) return apiErrorJson("invalid_body", 400, "column_id와 title이 필요합니다.");

  const column = await prisma.kanbanColumn.findFirst({
    where: { id: parsed.data.column_id, page_id: pageId },
  });
  if (!column) return apiErrorJson("not_found", 404, "컬럼을 찾을 수 없습니다.");

  const maxOrder = await prisma.kanbanCard.aggregate({
    where: { column_id: parsed.data.column_id },
    _max: { sort_order: true },
  });
  const sort_order = parsed.data.sort_order ?? (maxOrder._max.sort_order ?? 0) + 1;

  const card = await prisma.kanbanCard.create({
    data: {
      page_id: pageId,
      column_id: parsed.data.column_id,
      title: parsed.data.title,
      body: parsed.data.body ?? undefined,
      sort_order,
    },
  });

  await logPageAudit({
    pageId,
    action: "kanban_card_create",
    targetType: "kanban_card",
    targetId: card.id,
    meta: { title: card.title, column_id: card.column_id },
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
});
