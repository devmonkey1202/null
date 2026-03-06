import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { normalizeMobileSettings } from "@/lib/mobile-host";
import { parseJsonBody } from "@/lib/validation";
import { logAppAudit } from "@/lib/app-audit";

type Params = { pageId: string };

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("not_found", 404) };
  return { page, user, anonUserId, error: null };
}

const mobileSchema = z.object({
  appName: z.string().trim().min(1).max(80).optional().nullable(),
  appId: z.string().trim().min(3).max(120).optional().nullable(),
  serverUrl: z.string().trim().min(1).max(500).optional().nullable(),
  allowCleartext: z.boolean().optional(),
  statusBarStyle: z.enum(["default", "light", "dark"]).optional(),
  statusBarColor: z.string().trim().max(20).optional(),
  notes: z.string().max(500).optional(),
}).passthrough();

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;

  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: "mobile" } },
    select: { value: true, updated_at: true },
  });
  const settings = row?.value ?? null;
  return NextResponse.json({ settings, updatedAt: row?.updated_at?.toISOString() ?? null });
}

export async function PUT(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, user, anonUserId } = await requireOwner(pageId, req);
  if (error) return error;

  const parsed = await parseJsonBody(req, mobileSchema);
  if (parsed.error) return parsed.error;
  const normalized = normalizeMobileSettings(parsed.data);
  const settings = { ...parsed.data, ...normalized };

  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: "mobile" } },
    create: { page_id: pageId, key: "mobile", value: settings },
    update: { value: settings },
  });

  await logAppAudit({
    pageId,
    action: "mobile_settings_update",
    targetType: "mobile",
    targetId: null,
    meta: { appId: settings.appId ?? null, appName: settings.appName ?? null },
    actor: { userId: user!.id, anonId: anonUserId! },
  });

  return NextResponse.json({ ok: true, settings });
}
