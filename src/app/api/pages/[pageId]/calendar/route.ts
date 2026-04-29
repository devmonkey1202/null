import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string };

const postBodySchema = z.object({
  title: z.string().min(1).max(2000).trim(),
  start_at: z.string().datetime().or(z.coerce.date()),
  end_at: z.string().datetime().optional().nullable().or(z.coerce.date().optional().nullable()),
  all_day: z.boolean().optional(),
  meta: z.record(z.unknown()).optional(),
});

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const page = await getPageForAsset(pageId, req, user?.id ?? null);
  if (!page) return apiErrorJson("not_found", 404);

  const { searchParams } = new URL(req.url);
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  if (fromRaw && (Number.isNaN(from!.getTime()) || from!.getTime() < 0))
    return apiErrorJson("invalid_from", 400);
  if (toRaw && (Number.isNaN(to!.getTime()) || to!.getTime() < 0))
    return apiErrorJson("invalid_to", 400);

  const where: { page_id: string; start_at?: { gte?: Date; lte?: Date } } = { page_id: pageId };
  if (from || to) {
    where.start_at = {};
    if (from) where.start_at.gte = from;
    if (to) where.start_at.lte = to;
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { start_at: "asc" },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      pageId: e.page_id,
      title: e.title,
      startAt: e.start_at.toISOString(),
      endAt: e.end_at?.toISOString() ?? null,
      allDay: e.all_day,
      meta: e.meta,
      createdAt: e.created_at.toISOString(),
      updatedAt: e.updated_at.toISOString(),
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
  if (!parsed.success) return apiErrorJson("invalid_body", 400, "title과 start_at이 필요합니다.");

  const start_at = parsed.data.start_at instanceof Date ? parsed.data.start_at : new Date(parsed.data.start_at);
  const end_at =
    parsed.data.end_at != null
      ? parsed.data.end_at instanceof Date
        ? parsed.data.end_at
        : new Date(parsed.data.end_at as string)
      : null;

  const event = await prisma.calendarEvent.create({
    data: {
      page_id: pageId,
      title: parsed.data.title,
      start_at,
      end_at,
      all_day: parsed.data.all_day ?? false,
      meta: parsed.data.meta ? (parsed.data.meta as Prisma.InputJsonValue) : undefined,
    },
  });

  await logPageAudit({
    pageId,
    action: "calendar_create",
    targetType: "calendar",
    targetId: event.id,
    meta: { title: event.title, start_at: event.start_at.toISOString() },
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
