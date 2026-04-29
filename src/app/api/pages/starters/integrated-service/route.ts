import { NextResponse } from "next/server";

import { ensureAnonUser, resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { ensureIntegratedServiceProject } from "@/lib/integrated-service-project";

export async function POST(req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) {
    return apiErrorJson("anon_user_id_required", 401);
  }

  const user = await ensureAnonUser(anonUserId);
  if (!user) {
    return apiErrorJson("user_not_found", 404);
  }

  const result = await ensureIntegratedServiceProject({
    ownerId: user.id,
    userId: user.id,
    anonId: anonUserId,
  });

  return NextResponse.json({
    ok: true,
    created: result.created,
    pageId: result.pageId,
    title: result.title,
    editorUrl: result.editorUrl,
    dashboardUrl: result.dashboardUrl,
    publicUrl: result.publicUrl,
    validationUrl: result.validationUrl,
    credentials: result.credentials,
  });
}
