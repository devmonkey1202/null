import { NextResponse } from "next/server";
import { logApiError } from "@/lib/logger";
import { apiErrorJson } from "@/lib/api-error";
import { logAppAudit } from "@/lib/app-audit";
import { createServiceMediaAssetFromFile, issueServiceMediaAccessUrl } from "@/lib/service-media";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";

type Params = { pageId: string };

/**
 * 노코드 풀스택 7: 파일 업로드 (작품 단위)
 * POST: multipart/form-data "file" → 저장 후 URL 반환.
 * 로컬: public/uploads/[pageId]/[id].[ext]. 프로덕션은 Vercel Blob/S3 연동 권장.
 */
export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  if (!gate.access.anonUserId) return apiErrorJson("anon_required", 401);
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "create" });
  if (permissionError) return permissionError;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) return apiErrorJson("file_required", 400);

  try {
    const asset = await createServiceMediaAssetFromFile({
      pageId,
      file,
      visibility: "public",
      actor: gate.access.actor,
    });
    const accessUrl = asset ? await issueServiceMediaAccessUrl({ pageId, assetId: asset.id }) : null;
    await logAppAudit({
      pageId,
      action: "upload_file",
      targetType: "file",
      targetId: asset?.key ?? null,
      meta: { name: file.name, size: file.size, type: file.type },
      actor: gate.access.actor,
    });
    return NextResponse.json({
      ok: true,
      url: accessUrl?.url ?? null,
      id: asset?.key ?? null,
      backend: asset?.backend ?? null,
      assetId: asset?.id ?? null,
    });
  } catch (e) {
    logApiError(req, "upload write error", e);
    return apiErrorJson("upload_failed", 500);
  }
}
