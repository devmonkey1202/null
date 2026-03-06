import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { logApiError } from "@/lib/logger";
import { apiErrorJson } from "@/lib/api-error";
import { saveUpload } from "@/lib/storage";
import { logAppAudit } from "@/lib/app-audit";

type Params = { pageId: string };

/**
 * 노코드 풀스택 7: 파일 업로드 (작품 단위)
 * POST: multipart/form-data "file" → 저장 후 URL 반환.
 * 로컬: public/uploads/[pageId]/[id].[ext]. 프로덕션은 Vercel Blob/S3 연동 권장.
 */
export async function POST(req: Request, context: { params: Promise<Params> }) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return apiErrorJson("not_found", 404);

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) return apiErrorJson("file_required", 400);

  try {
    const result = await saveUpload(pageId, file);
    await logAppAudit({
      pageId,
      action: "upload_file",
      targetType: "file",
      targetId: result.key,
      meta: { name: file.name, size: file.size, type: file.type },
      actor: { userId: user.id, anonId: anonUserId },
    });
    return NextResponse.json({ ok: true, url: result.url, id: result.key, backend: result.backend });
  } catch (e) {
    logApiError(req, "upload write error", e);
    return apiErrorJson("upload_failed", 500);
  }
}
