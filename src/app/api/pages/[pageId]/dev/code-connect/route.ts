import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { buildCodeConnectManifest, hydrateExternalDevDoc } from "@/lib/dev-external";

type Params = { pageId: string };

async function requireOwnerPage(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { error: apiErrorJson("anon_user_id_required", 401), page: null as null };

  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: {
      id: true,
      owner: { select: { anon_id: true } },
      current_version: { select: { content_json: true } },
    },
  });
  if (!page) return { error: apiErrorJson("not_found", 404), page: null as null };
  if (page.owner.anon_id !== anonUserId) return { error: apiErrorJson("forbidden", 403), page: null as null };
  return { error: null, page };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  const access = await requireOwnerPage(pageId, req);
  if (access.error || !access.page) return access.error;

  const doc = hydrateExternalDevDoc(access.page.current_version?.content_json);
  if (!doc) return apiErrorJson("version_not_found", 404);

  return NextResponse.json({
    ok: true,
    manifest: buildCodeConnectManifest(doc, pageId),
  });
}
