import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { buildCapacitorHostConfig, buildReactNativeHostConfig, resolveMobileHostConfig } from "@/lib/mobile-host";
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

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, user, anonUserId } = await requireOwner(pageId, req);
  if (error) return error;

  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: "mobile" } },
    select: { value: true, updated_at: true },
  });
  const settings = row?.value ?? {};
  const settingsObj =
    typeof settings === "object" && settings && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const resolved = resolveMobileHostConfig(settings);

  await logAppAudit({
    pageId,
    action: "mobile_host_config",
    targetType: "mobile",
    targetId: null,
    meta: { appId: typeof settingsObj.appId === "string" ? settingsObj.appId : null },
    actor: { userId: user!.id, anonId: anonUserId! },
  });

  return NextResponse.json({
    settings,
    resolved,
    capacitor: buildCapacitorHostConfig(settings),
    reactNative: buildReactNativeHostConfig(settings),
    updatedAt: row?.updated_at?.toISOString() ?? null,
  });
}
