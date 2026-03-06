import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string };

const putBodySchema = z.object({
  content: z.string().max(500000),
});

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const page = await getPageForAsset(pageId, req, user?.id ?? null);
  if (!page) return apiErrorJson("not_found", 404);

  const note = await prisma.note.findUnique({
    where: { page_id: pageId },
  });

  if (!note) {
    return NextResponse.json({
      note: null,
      content: "",
      createdAt: null,
      updatedAt: null,
    });
  }

  return NextResponse.json({
    note: {
      id: note.id,
      pageId: note.page_id,
      content: note.content,
      createdAt: note.created_at.toISOString(),
      updatedAt: note.updated_at.toISOString(),
    },
  });
});

export const PUT = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true, anon_id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  const raw = await req.json().catch(() => ({}));
  const parsed = putBodySchema.safeParse(raw);
  if (!parsed.success) return apiErrorJson("invalid_body", 400, "content가 필요합니다. (최대 500000자)");

  const note = await prisma.note.upsert({
    where: { page_id: pageId },
    create: {
      page_id: pageId,
      author_user_id: user.id,
      author_anon_id: user.anon_id,
      content: parsed.data.content,
    },
    update: {
      content: parsed.data.content,
    },
  });

  await logPageAudit({
    pageId,
    action: "note_upsert",
    targetType: "note",
    targetId: note.id,
    meta: { length: parsed.data.content.length },
    actor: { userId: user.id, anonId: anonUserId },
  });

  return NextResponse.json({
    note: {
      id: note.id,
      pageId: note.page_id,
      content: note.content,
      createdAt: note.created_at.toISOString(),
      updatedAt: note.updated_at.toISOString(),
    },
  });
});
