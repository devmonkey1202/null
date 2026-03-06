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
  title: z.string().min(1).max(500).trim(),
  sort_order: z.number().int().min(0).optional(),
});

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const page = await getPageForAsset(pageId, req, user?.id ?? null);
  if (!page) return apiErrorJson("not_found", 404);

  const columns = await prisma.kanbanColumn.findMany({
    where: { page_id: pageId },
    orderBy: { sort_order: "asc" },
    include: {
      cards: { orderBy: { sort_order: "asc" } },
    },
  });

  return NextResponse.json({
    columns: columns.map((c) => ({
      id: c.id,
      pageId: c.page_id,
      title: c.title,
      sortOrder: c.sort_order,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
      cards: c.cards.map((card) => ({
        id: card.id,
        pageId: card.page_id,
        columnId: card.column_id,
        title: card.title,
        body: card.body,
        sortOrder: card.sort_order,
        createdAt: card.created_at.toISOString(),
        updatedAt: card.updated_at.toISOString(),
      })),
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
  if (!parsed.success) return apiErrorJson("invalid_body", 400, "title이 필요합니다. (1~500자)");

  const maxOrder = await prisma.kanbanColumn.aggregate({
    where: { page_id: pageId },
    _max: { sort_order: true },
  });
  const sort_order = parsed.data.sort_order ?? (maxOrder._max.sort_order ?? 0) + 1;

  const column = await prisma.kanbanColumn.create({
    data: {
      page_id: pageId,
      title: parsed.data.title,
      sort_order,
    },
  });

  await logPageAudit({
    pageId,
    action: "kanban_column_create",
    targetType: "kanban_column",
    targetId: column.id,
    meta: { title: column.title },
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
});
