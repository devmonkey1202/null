import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId, ensureAnonUser } from "@/lib/anon";
import { expireStalePages } from "@/lib/expire";
import { figmaFileToNullDoc } from "@/lib/figmaToNull";
import { FigmaApiError } from "@/lib/figma";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";

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
    z
      .object({
        fileKey: z.string().optional(),
        accessToken: z.string().optional(),
        nodeId: z.string().optional(),
        importAsNewPage: z.boolean().optional(),
        fileName: z.string().optional(),
      })
      .passthrough()
  );
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const fileKey = body.fileKey?.trim();
  if (!fileKey) {
    return apiErrorJson("file_key_required", 400);
  }

  const accessToken = body.accessToken?.trim() || process.env.FIGMA_ACCESS_TOKEN;
  if (!accessToken) {
    return apiErrorJson("figma_token_required", 400, {
      message:
        "Figma Access Token이 필요합니다. Figma 설정(Settings) → Personal access tokens에서 토큰을 발급한 뒤 위 입력란에 붙여넣거나, 서버 .env에 FIGMA_ACCESS_TOKEN을 설정하세요.",
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
  } catch (e) {
    if (e instanceof FigmaApiError) {
      const status = e.status >= 500 ? 502 : e.status >= 400 ? 400 : 500;
      return apiErrorJson("figma_api_error", status, {
        message: e.message,
        extra: { status: e.status },
      });
    }
    return apiErrorJson("import_failed", 500, {
      message: e instanceof Error ? e.message : "알 수 없는 오류",
    });
  }
}
