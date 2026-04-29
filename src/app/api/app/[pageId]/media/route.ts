import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { createServiceMediaAssetFromFile, listServiceMediaAssets } from "@/lib/service-media";

type Params = { pageId: string };

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "read" });
  if (permissionError) return permissionError;

  const url = new URL(req.url);
  const result = await listServiceMediaAssets({
    pageId,
    kind: (url.searchParams.get("kind") ?? "").trim().toLowerCase() as never,
    status: url.searchParams.get("status"),
    limit: Number(url.searchParams.get("limit") ?? "20"),
    offset: Number(url.searchParams.get("offset") ?? "0"),
  });
  return NextResponse.json(result);
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "create" });
  if (permissionError) return permissionError;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return apiErrorJson("file_required", 400);

  const visibility = String(formData?.get("visibility") ?? "public").trim().toLowerCase() === "signed" ? "signed" : "public";
  const asset = await createServiceMediaAssetFromFile({
    pageId,
    file,
    visibility,
    actor: gate.access.actor,
  });
  return NextResponse.json({ ok: true, asset });
}
