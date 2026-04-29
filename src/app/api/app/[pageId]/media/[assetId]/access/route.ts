import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { issueServiceMediaAccessUrl, resolveServiceMediaAccess } from "@/lib/service-media";

type Params = { pageId: string; assetId: string };

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId, assetId } = await context.params;
  if (!pageId || !assetId) return apiErrorJson("bad_request", 400);

  const url = new URL(req.url);
  const result = await resolveServiceMediaAccess({
    pageId,
    assetId,
    variant: url.searchParams.get("variant") ?? "original",
    token: url.searchParams.get("token"),
    expires: url.searchParams.get("expires") ? Number(url.searchParams.get("expires")) : null,
  });
  if (!result.ok) return apiErrorJson(result.error, result.error === "service_media_asset_not_found" ? 404 : 403);

  const body = new Uint8Array(result.buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "Content-Length": String(result.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId, assetId } = await context.params;
  if (!pageId || !assetId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "read" });
  if (permissionError) return permissionError;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const issued = await issueServiceMediaAccessUrl({
    pageId,
    assetId,
    variant: typeof parsed.data.variant === "string" ? parsed.data.variant : "original",
    expiresInSec: Number(parsed.data.expiresInSec ?? "3600"),
  });
  if (!issued) return apiErrorJson("not_found", 404);
  return NextResponse.json({ ok: true, ...issued });
}
