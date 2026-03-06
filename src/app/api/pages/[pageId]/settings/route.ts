import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getPageForAsset } from "@/lib/page-access";
import { apiErrorJson } from "@/lib/api-error";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string };

const putBodySchema = z.object({
  key: z.string().min(1).max(200).trim(),
  value: z.unknown(),
});

/** GET: 페이지별 설정 전체 또는 key 쿼리로 단일 조회 */
export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const anonUserId = await resolveAnonUserId(req);
  const user = anonUserId ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } }) : null;
  const page = await getPageForAsset(pageId, req, user?.id ?? null);
  if (!page) return apiErrorJson("not_found", 404);

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  try {
    if (key) {
      const row = await prisma.pageSetting.findUnique({
        where: { page_id_key: { page_id: pageId, key } },
        select: { key: true, value: true, updated_at: true },
      });
      if (!row) return NextResponse.json({ key, value: null });
      return NextResponse.json({
        key: row.key,
        value: row.value,
        updatedAt: row.updated_at.toISOString(),
      });
    }

    const rows = await prisma.pageSetting.findMany({
      where: { page_id: pageId },
      select: { key: true, value: true, updated_at: true },
    });
    const settings: Record<string, { value: unknown; updatedAt: string }> = {};
    for (const r of rows) {
      settings[r.key] = { value: r.value, updatedAt: r.updated_at.toISOString() };
    }
    return NextResponse.json({ settings });
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (err instanceof TypeError && (msg.includes("findMany") || msg.includes("findUnique"))) {
      return NextResponse.json(key ? { key, value: null } : { settings: {} });
    }
    throw err;
  }
});

/** PUT: 페이지별 설정 한 키 저장 (upsert). 소유자/협업만. */
export const PUT = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await getPageForAsset(pageId, req, user.id);
  if (!page) return apiErrorJson("not_found", 404);

  const raw = await req.json().catch(() => ({}));
  const parsed = putBodySchema.safeParse(raw);
  if (!parsed.success) return apiErrorJson("invalid_body", 400, "key(1~200)와 value가 필요합니다.");

  const { key, value } = parsed.data;
  const storedValue = value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

  try {
    await prisma.pageSetting.upsert({
      where: { page_id_key: { page_id: pageId, key } },
      create: { page_id: pageId, key, value: storedValue },
      update: { value: storedValue },
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (err instanceof TypeError && msg.includes("upsert")) {
      return NextResponse.json({ ok: true, key, value });
    }
    throw err;
  }

  await logPageAudit({
    pageId,
    action: "settings_update",
    targetType: "page_setting",
    targetId: key,
    meta: null,
    actor: { userId: user.id, anonId: anonUserId },
  });

  return NextResponse.json({ ok: true, key, value });
});
