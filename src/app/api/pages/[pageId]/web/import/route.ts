import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureAnonUser, resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { prisma } from "@/lib/db";
import { expireStalePages } from "@/lib/expire";
import {
  normalizeWebImportLanguage,
  normalizeWebImportQuery,
  normalizeWebImportTheme,
  WEB_IMPORT_VIEWPORT_IDS,
} from "@/lib/webImportShared";
import { captureWebToNullDoc, htmlCodeToNullDoc, publicUrlBatchToNullDoc, publicUrlToNullDoc, webFileToNullDoc } from "@/lib/webToNull";

type Params = { pageId: string };

const viewportSchema = z.enum(WEB_IMPORT_VIEWPORT_IDS);
const urlImportSchema = z.object({
  mode: z.literal("url").optional(),
  url: z.string().min(1),
  viewportId: viewportSchema.optional(),
  language: z.string().trim().optional(),
  query: z.string().trim().optional(),
  theme: z.string().trim().optional(),
});
const bulkImportSchema = z.object({
  mode: z.literal("url-bulk"),
  urls: z.array(z.string().min(1)).min(1).max(8),
  viewportId: viewportSchema.optional(),
  language: z.string().trim().optional(),
  query: z.string().trim().optional(),
  theme: z.string().trim().optional(),
});
const htmlImportSchema = z.object({
  mode: z.literal("html"),
  html: z.string().min(1),
  css: z.string().optional(),
  title: z.string().trim().optional(),
  viewportId: viewportSchema.optional(),
});
const captureImportSchema = z.object({
  mode: z.literal("capture"),
  captureKind: z.enum(["private-page-capture", "local-page-capture"]),
  payload: z.string().min(1),
  viewportId: viewportSchema.optional(),
});

async function parseWebImportRequest(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return { data: null, error: apiErrorJson("invalid_body", 400, "요청 본문이 올바르지 않습니다.") } as const;
    }
    const fileEntry = formData.get("importFile");
    if (!(fileEntry instanceof File)) {
      return { data: null, error: apiErrorJson("invalid_body", 400, "가져올 파일이 필요합니다.") } as const;
    }
    const rawViewportId = formData.get("viewportId");
    const viewportId =
      typeof rawViewportId === "string" && rawViewportId
        ? viewportSchema.safeParse(rawViewportId)
        : null;
    if (viewportId && !viewportId.success) {
      return { data: null, error: apiErrorJson("invalid_body", 400, "요청 본문이 올바르지 않습니다.") } as const;
    }
    return {
      data: {
        mode: "file" as const,
        fileName: fileEntry.name || "import.html",
        buffer: Buffer.from(await fileEntry.arrayBuffer()),
        viewportId: viewportId?.success ? viewportId.data : undefined,
      },
      error: null,
    } as const;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { data: null, error: apiErrorJson("invalid_body", 400, "요청 본문이 올바르지 않습니다.") } as const;
  }
  if (!body || typeof body !== "object") {
    return { data: null, error: apiErrorJson("invalid_body", 400, "요청 본문이 올바르지 않습니다.") } as const;
  }
  const parsed =
    "html" in body
      ? htmlImportSchema.safeParse(body)
      : "captureKind" in body
        ? captureImportSchema.safeParse(body)
      : "urls" in body
        ? bulkImportSchema.safeParse(body)
      : urlImportSchema.safeParse(body);
  if (!parsed.success) {
    return { data: null, error: apiErrorJson("invalid_body", 400, "요청 본문이 올바르지 않습니다.") } as const;
  }
  return { data: parsed.data, error: null } as const;
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

  const parsed = await parseWebImportRequest(req);
  if (parsed.error) return parsed.error;

  try {
    const imported =
      parsed.data.mode === "file"
        ? await webFileToNullDoc({
            fileName: parsed.data.fileName,
            buffer: parsed.data.buffer,
            viewportId: parsed.data.viewportId,
          })
        : parsed.data.mode === "url-bulk"
          ? await publicUrlBatchToNullDoc({
              urls: parsed.data.urls,
              viewportId: parsed.data.viewportId,
              language: normalizeWebImportLanguage(parsed.data.language),
              query: normalizeWebImportQuery(parsed.data.query),
              theme: normalizeWebImportTheme(parsed.data.theme),
            })
        : parsed.data.mode === "capture"
          ? captureWebToNullDoc({
              payloadText: parsed.data.payload,
              captureKind: parsed.data.captureKind,
              viewportId: parsed.data.viewportId,
            })
        : parsed.data.mode === "html"
          ? htmlCodeToNullDoc({
              html: parsed.data.html,
              css: parsed.data.css,
              title: parsed.data.title,
              viewportId: parsed.data.viewportId,
            })
          : await publicUrlToNullDoc({
              url: parsed.data.url,
              viewportId: parsed.data.viewportId,
              language: normalizeWebImportLanguage(parsed.data.language),
              query: normalizeWebImportQuery(parsed.data.query),
              theme: normalizeWebImportTheme(parsed.data.theme),
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
