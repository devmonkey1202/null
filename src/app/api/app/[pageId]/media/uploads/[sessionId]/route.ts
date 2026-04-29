import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { appendServiceMediaUploadChunk, completeServiceMediaUploadSession } from "@/lib/service-media";

type Params = { pageId: string; sessionId: string };

export async function PATCH(req: Request, context: { params: Promise<Params> }) {
  const { pageId, sessionId } = await context.params;
  if (!pageId || !sessionId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "update" });
  if (permissionError) return permissionError;

  const offset = Number(req.headers.get("x-upload-offset") ?? "0");
  if (!Number.isFinite(offset) || offset < 0) {
    return apiErrorJson("bad_request", 400, "invalid_upload_offset");
  }

  const chunk = Buffer.from(await req.arrayBuffer());
  const result = await appendServiceMediaUploadChunk({
    pageId,
    sessionId,
    offset,
    chunk,
  });
  if (!result.ok) return apiErrorJson(result.error, 400);
  return NextResponse.json({ ok: true, receivedSize: result.receivedSize, totalSize: result.totalSize });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId, sessionId } = await context.params;
  if (!pageId || !sessionId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "update" });
  if (permissionError) return permissionError;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const action = String(parsed.data.action ?? "complete").trim().toLowerCase();
  if (action !== "complete") return apiErrorJson("bad_action", 400);

  const result = await completeServiceMediaUploadSession({
    pageId,
    sessionId,
    actor: gate.access.actor,
  });
  if (!result.ok) return apiErrorJson(result.error, 400);
  return NextResponse.json({ ok: true, asset: result.asset });
}
