import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureAnonUser, resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { prisma } from "@/lib/db";
import { expireStalePages } from "@/lib/expire";
import { FigmaApiError } from "@/lib/figma";
import { directFigmaSourceToNullDoc, readDirectFigmaSource } from "@/lib/figmaBundle";
import { figmaFileToNullDoc } from "@/lib/figmaToNull";
import { parseJsonBody } from "@/lib/validation";

type Params = { pageId: string };

function buildUnsupportedBinaryError() {
  return apiErrorJson("unsupported_fig_binary", 400, {
    message: "직접 .fig 바이너리 포맷은 아직 지원되지 않습니다. bundle 또는 Figma REST JSON 소스를 사용해 주세요.",
  });
}

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

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const directFile = form.get("bundleFile") ?? form.get("packageFile") ?? form.get("figFile");
      if (!directFile) {
        return apiErrorJson("direct_bundle_required", 400);
      }
      const source = await readDirectFigmaSource(directFile);
      const imported = directFigmaSourceToNullDoc(source);
      return NextResponse.json({
        ok: true,
        doc: imported.doc,
        importAsNewPage: form.get("importAsNewPage") === "true",
        directBundle: imported.descriptor.kind === "null-bundle",
        directSource: imported.descriptor,
        compatibilityReport: imported.compatibilityReport,
        fidelityReport: imported.fidelityReport,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "unsupported_fig_binary") {
        return buildUnsupportedBinaryError();
      }
      return apiErrorJson("direct_bundle_import_failed", 400, {
        message: error instanceof Error ? error.message : "direct_bundle_import_failed",
      });
    }
  }

  const parsed = await parseJsonBody(
    req,
    z
      .object({
        fileKey: z.string().optional(),
        accessToken: z.string().optional(),
        nodeId: z.string().optional(),
        importAsNewPage: z.boolean().optional(),
        fileName: z.string().optional(),
        bundleBase64: z.string().optional(),
        packageBase64: z.string().optional(),
        bundle: z.unknown().optional(),
      })
      .passthrough(),
  );
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  if (body.bundleBase64 || body.packageBase64 || body.bundle) {
    try {
      const directSource =
        body.bundleBase64 ??
        body.packageBase64 ??
        (body.bundle && typeof body.bundle === "object" ? body.bundle : null);
      if (!directSource) {
        return apiErrorJson("direct_bundle_required", 400);
      }
      const source = await readDirectFigmaSource(directSource);
      const imported = directFigmaSourceToNullDoc(source);
      return NextResponse.json({
        ok: true,
        doc: imported.doc,
        importAsNewPage: body.importAsNewPage ?? false,
        directBundle: imported.descriptor.kind === "null-bundle",
        directSource: imported.descriptor,
        compatibilityReport: imported.compatibilityReport,
        fidelityReport: imported.fidelityReport,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "unsupported_fig_binary") {
        return buildUnsupportedBinaryError();
      }
      return apiErrorJson("direct_bundle_import_failed", 400, {
        message: error instanceof Error ? error.message : "direct_bundle_import_failed",
      });
    }
  }

  const fileKey = body.fileKey?.trim();
  if (!fileKey) {
    return apiErrorJson("file_key_required", 400);
  }

  const accessToken = body.accessToken?.trim() || process.env.FIGMA_ACCESS_TOKEN;
  if (!accessToken) {
    return apiErrorJson("figma_token_required", 400, {
      message:
        "Figma Access Token이 필요합니다. Figma 설정(Settings) > Personal access tokens에서 토큰을 발급받아 입력하거나 서버 .env의 FIGMA_ACCESS_TOKEN을 설정해 주세요.",
    });
  }

  try {
    const doc = await figmaFileToNullDoc({
      fileKey,
      accessToken,
      nodeId: body.nodeId?.trim() || undefined,
      fileName: body.fileName?.trim() || undefined,
    });

    return NextResponse.json({
      ok: true,
      doc,
      importAsNewPage: body.importAsNewPage ?? false,
    });
  } catch (error) {
    if (error instanceof FigmaApiError) {
      const status = error.status >= 500 ? 502 : error.status >= 400 ? 400 : 500;
      return apiErrorJson("figma_api_error", status, {
        message: error.message,
        extra: { status: error.status },
      });
    }
    return apiErrorJson("import_failed", 500, {
      message: error instanceof Error ? error.message : "알 수 없는 오류",
    });
  }
}
