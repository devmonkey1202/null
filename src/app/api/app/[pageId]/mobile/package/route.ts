import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { buildMobileHostPackage } from "@/lib/mobile-package";
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

  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type") ?? "capacitor";
  if (typeParam !== "capacitor" && typeParam !== "react-native") {
    return apiErrorJson("invalid_type", 400, { extra: { allowed: ["capacitor", "react-native"] } });
  }

  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: "mobile" } },
    select: { value: true },
  });
  const settings = row?.value ?? {};

  try {
    const pkg = buildMobileHostPackage(typeParam, settings);
    const filename = `${pkg.name}-${pageId.slice(0, 8)}.zip`;

    const zipBuffer = pkg.zip instanceof Uint8Array ? new Uint8Array(pkg.zip) : new Uint8Array(pkg.zip);
    const body = new Blob([zipBuffer]);

    await logAppAudit({
      pageId,
      action: "mobile_package",
      targetType: "mobile",
      targetId: typeParam,
      meta: { name: pkg.name },
      actor: { userId: user!.id, anonId: anonUserId! },
    });

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    await logAppAudit({
      pageId,
      action: "mobile_package_failed",
      targetType: "mobile",
      targetId: typeParam,
      meta: { detail: message },
      actor: { userId: user!.id, anonId: anonUserId! },
    });
    return apiErrorJson("package_failed", 500, { message: "package_failed", detail: message });
  }
}