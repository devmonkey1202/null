import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureAnonUser, resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { prisma } from "@/lib/db";
import { expireStalePages } from "@/lib/expire";
import { parseJsonBody } from "@/lib/validation";
import { WEB_IMPORT_VIEWPORT_IDS } from "@/lib/webImportShared";
import { publicUrlToNullDoc } from "@/lib/webToNull";

type Params = { pageId: string };

export async function POST(req: Request, context: { params: Promise<Params> }) {
  await expireStalePages();

  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) {
    return apiErrorJson("anon_user_id_required", 401);
  }

  const { pageId } = await context.params;
  if (!pageId) {
    return apiErrorJson("bad_page_id", 400);
  }

  const user = await ensureAnonUser(anonUserId);
  if (!user) {
    return apiErrorJson("user_not_found", 404);
  }

  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
  });
  if (!page) {
    return apiErrorJson("not_found", 404);
  }

  const parsed = await parseJsonBody(
    req,
    z.object({
      url: z.string().min(1),
      viewportId: z.enum(WEB_IMPORT_VIEWPORT_IDS).optional(),
    }),
  );
  if (parsed.error) return parsed.error;

  try {
    const imported = await publicUrlToNullDoc({
      url: parsed.data.url,
      viewportId: parsed.data.viewportId,
    });
    return NextResponse.json({
      ok: true,
      doc: imported.doc,
      importSource: imported.importSource,
      blockCount: imported.blockCount,
    });
  } catch (error) {
    return apiErrorJson("web_import_failed", 400, {
      message: error instanceof Error ? error.message : "웹 가져오기에 실패했습니다.",
    });
  }
}
