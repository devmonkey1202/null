import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import {
  deleteServiceMediaAsset,
  getServiceMediaAsset,
  scheduleServiceMediaProcessing,
  updateServiceMediaAssetVisibility,
} from "@/lib/service-media";

type Params = { pageId: string; assetId: string };

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId, assetId } = await context.params;
  if (!pageId || !assetId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "read" });
  if (permissionError) return permissionError;

  const asset = await getServiceMediaAsset(pageId, assetId);
  if (!asset) return apiErrorJson("not_found", 404);
  return NextResponse.json({ asset });
}

export async function PATCH(req: Request, context: { params: Promise<Params> }) {
  const { pageId, assetId } = await context.params;
  if (!pageId || !assetId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "update" });
  if (permissionError) return permissionError;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const action = String(parsed.data.action ?? "").trim().toLowerCase();

  if (action === "reprocess") {
    await scheduleServiceMediaProcessing({ pageId, assetId });
    return NextResponse.json({ ok: true, scheduled: true });
  }

  if (action === "visibility") {
    const updated = await updateServiceMediaAssetVisibility({
      pageId,
      assetId,
      visibility: String(parsed.data.visibility ?? "public").trim().toLowerCase() === "signed" ? "signed" : "public",
      actor: gate.access.actor,
    });
    if (!updated) return apiErrorJson("not_found", 404);
    return NextResponse.json({ ok: true, asset: updated });
  }

  return apiErrorJson("bad_action", 400);
}

export async function DELETE(req: Request, context: { params: Promise<Params> }) {
  const { pageId, assetId } = await context.params;
  if (!pageId || !assetId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "delete" });
  if (permissionError) return permissionError;

  const result = await deleteServiceMediaAsset({
    pageId,
    assetId,
    actor: gate.access.actor,
  });
  if (!result.ok) return apiErrorJson(result.error ?? "delete_failed", 400);
  return NextResponse.json({ ok: true });
}
