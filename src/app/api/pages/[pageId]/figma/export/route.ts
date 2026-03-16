import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensureAnonUser, resolveAnonUserId } from "@/lib/anon";
import { expireStalePages } from "@/lib/expire";
import { apiErrorJson } from "@/lib/api-error";
import { hydrateDoc } from "@/advanced/doc/scene";
import { nullDocToFigmaPayload } from "@/lib/nullToFigma";
import {
  encodeDirectFigmaBundleBase64,
  encodeDirectFigmaPackageBase64,
  nullDocToDirectFigmaBundle,
  parseDirectFigmaSourceDescriptor,
  writeDirectFigBinary,
  stringifyDirectFigmaBundle,
  writeDirectFigmaPackage,
  writeDirectFigmaBundle,
} from "@/lib/figmaBundle";

type Params = { pageId: string };

export async function GET(req: Request, context: { params: Promise<Params> }) {
  await expireStalePages();

  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) {
    return apiErrorJson("anon_user_id_required", 401);
  }

  const user = await ensureAnonUser(anonUserId);
  if (!user) {
    return apiErrorJson("user_not_found", 404);
  }

  const { pageId } = await context.params;
  if (!pageId) {
    return apiErrorJson("bad_page_id", 400);
  }

  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    include: { current_version: true },
  });

  if (!page) {
    return apiErrorJson("not_found", 404);
  }

  if (!page.current_version?.content_json || typeof page.current_version.content_json !== "object") {
    return apiErrorJson("content_required", 400);
  }

  const doc = hydrateDoc(page.current_version.content_json);
  const url = new URL(req.url);
  const format = url.searchParams.get("format")?.trim().toLowerCase();
  const bundle = nullDocToDirectFigmaBundle(doc, {
    fileName: page.title?.trim() || page.id,
  });

  if (format === "bundle" || format === "fig" || format === "figbundle") {
    const filename = `${(page.title?.trim() || page.id).replace(/[\\/:*?"<>|]+/g, "_")}.figbundle`;
    const body = new Uint8Array(writeDirectFigmaBundle(bundle));
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Null-Figma-Bundle": "1",
      },
    });
  }
  if (format === "fig-binary" || format === "figraw") {
    const binary = writeDirectFigBinary(bundle);
    if (!binary) {
      return apiErrorJson("direct_fig_binary_unavailable", 501, {
        message: "직접 .fig 바이너리 writer adapter가 아직 연결되지 않았습니다.",
      });
    }
    const filename = `${(page.title?.trim() || page.id).replace(/[\\/:*?"<>|]+/g, "_")}.fig`;
    const bytes = Uint8Array.from(binary.bytes);
    const body = new Blob([bytes.buffer]);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Null-Figma-Binary-Adapter": binary.adapterName,
      },
    });
  }
  if (format === "package" || format === "figpkg" || format === "figzip") {
    const filename = `${(page.title?.trim() || page.id).replace(/[\\/:*?"<>|]+/g, "_")}.figpkg.zip`;
    const body = new Uint8Array(writeDirectFigmaPackage(bundle));
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Null-Figma-Package": "1",
      },
    });
  }
  if (format === "bundle-json") {
    return new NextResponse(stringifyDirectFigmaBundle(bundle), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
  if (format === "bundle-base64") {
    return NextResponse.json({
      ok: true,
      bundleBase64: encodeDirectFigmaBundleBase64(bundle),
      directSource: parseDirectFigmaSourceDescriptor(bundle),
      compatibilityReport: bundle.compatibilityReport,
      fidelityReport: bundle.fidelityReport,
    });
  }
  if (format === "package-base64" || format === "figpkg-base64") {
    const directSource = parseDirectFigmaSourceDescriptor(writeDirectFigmaPackage(bundle));
    return NextResponse.json({
      ok: true,
      packageBase64: encodeDirectFigmaPackageBase64(bundle),
      directSource,
      compatibilityReport: bundle.compatibilityReport,
      fidelityReport: bundle.fidelityReport,
    });
  }

  const exported = nullDocToFigmaPayload(doc, {
    fileName: page.title?.trim() || page.id,
  });

  return NextResponse.json({
    ok: true,
    file: exported.file,
    localVariables: exported.localVariables,
  });
}
