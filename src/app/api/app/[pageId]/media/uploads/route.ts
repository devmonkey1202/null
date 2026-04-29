import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { createServiceMediaUploadSession } from "@/lib/service-media";

type Params = { pageId: string };

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "create" });
  if (permissionError) return permissionError;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const fileName = String(parsed.data.fileName ?? "").trim();
  const totalSize = Number(parsed.data.totalSize ?? 0);
  if (!fileName || !Number.isFinite(totalSize) || totalSize <= 0) {
    return apiErrorJson("bad_request", 400, "fileName_and_totalSize_required");
  }

  const session = await createServiceMediaUploadSession({
    pageId,
    fileName,
    mimeType: typeof parsed.data.mimeType === "string" ? parsed.data.mimeType : undefined,
    totalSize,
    chunkSize: Number(parsed.data.chunkSize ?? 0) || undefined,
    visibility: String(parsed.data.visibility ?? "public").trim().toLowerCase() === "signed" ? "signed" : "public",
    actor: gate.access.actor,
  });
  return NextResponse.json({ ok: true, session });
}
