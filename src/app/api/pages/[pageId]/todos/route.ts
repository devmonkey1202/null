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
  title: z.string().min(1).max(2000).trim(),
  sort_order: z.number().int().min(0).optional(),
});

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const page = await getPageForAsset(pageId, req, user?.id ?? null);
  if (!page) return apiErrorJson("not_found", 404);

  const todos = await prisma.todo.findMany({
    where: { page_id: pageId },
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  });

  return NextResponse.json({
    todos: todos.map((t) => ({
      id: t.id,
      pageId: t.page_id,
      title: t.title,
      done: t.done,
      sortOrder: t.sort_order,
      createdAt: t.created_at.toISOString(),
      updatedAt: t.updated_at.toISOString(),
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
  if (!parsed.success) return apiErrorJson("invalid_body", 400, "title이 필요합니다. (1~2000자)");

  const maxOrder = await prisma.todo.aggregate({
    where: { page_id: pageId },
    _max: { sort_order: true },
  });
  const sort_order = parsed.data.sort_order ?? (maxOrder._max.sort_order ?? 0) + 1;

  const todo = await prisma.todo.create({
    data: {
      page_id: pageId,
      title: parsed.data.title,
      sort_order,
    },
  });

  await logPageAudit({
    pageId,
    action: "todo_create",
    targetType: "todo",
    targetId: todo.id,
    meta: { title: todo.title },
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
