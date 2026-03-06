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
  start_at: z.string().datetime().or(z.coerce.date()).optional(),
  end_at: z.string().datetime().optional().nullable().or(z.coerce.date().optional().nullable()),
  all_day: z.boolean().optional(),
  meta: z.record(z.unknown()).optional(),
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

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, page_id: pageId },
  });
  if (!existing) return apiErrorJson("not_found", 404);

  const raw = await req.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) return apiErrorJson("invalid_body", 400);

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.start_at !== undefined)
    data.start_at = parsed.data.start_at instanceof Date ? parsed.data.start_at : new Date(parsed.data.start_at);
  if (parsed.data.end_at !== undefined)
    data.end_at =
      parsed.data.end_at == null
        ? null
        : parsed.data.end_at instanceof Date
          ? parsed.data.end_at
          : new Date(parsed.data.end_at as string);
  if (parsed.data.all_day !== undefined) data.all_day = parsed.data.all_day;
  if (parsed.data.meta !== undefined) data.meta = parsed.data.meta;

  const event = await prisma.calendarEvent.update({
    where: { id },
    data,
  });

  await logPageAudit({
    pageId,
    action: "calendar_update",
    targetType: "calendar",
    targetId: event.id,
    meta: { changed: Object.keys(data) },
    actor: { userId: user.id, anonId: anonUserId },
  });

  return NextResponse.json({
    event: {
      id: event.id,
      pageId: event.page_id,
      title: event.title,
      startAt: event.start_at.toISOString(),
      endAt: event.end_at?.toISOString() ?? null,
      allDay: event.all_day,
      meta: event.meta,
      createdAt: event.created_at.toISOString(),
      updatedAt: event.updated_at.toISOString(),
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

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, page_id: pageId },
  });
  if (!existing) return apiErrorJson("not_found", 404);

  await prisma.calendarEvent.delete({ where: { id } });
  await logPageAudit({
    pageId,
    action: "calendar_delete",
    targetType: "calendar",
    targetId: id,
    meta: null,
    actor: { userId: user.id, anonId: anonUserId },
  });
  return NextResponse.json({ ok: true });
});
