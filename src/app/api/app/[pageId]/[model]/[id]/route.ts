import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getCollectionBySlug, getRecord, updateRecord, deleteRecord, validateRecordData, type AppFieldDef } from "@/lib/app-data";
import { logAppAudit } from "@/lib/app-audit";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";
import { resolveAppUserFromRequest } from "@/lib/app-request";

type Params = { pageId: string; model: string; id: string };

const APP_USER_FIELD = "app_user_id";
const APP_USER_ALLOWED_TYPES = new Set<AppFieldDef["type"]>(["string", "relation"]);

function getAppUserField(fields: AppFieldDef[]) {
  return fields.find((field) => field.name === APP_USER_FIELD) ?? null;
}

async function getPageAndAccess(pageId: string, req: Request) {
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner: { select: { anon_id: true } }, status: true, is_hidden: true },
  });
  if (!page) return { page: null as null, isOwner: false, appUser: null as null };
  const anonUserId = await resolveAnonUserId(req);
  const isOwner = !!anonUserId && page.owner.anon_id === anonUserId;
  const appUser = await resolveAppUserFromRequest(pageId, req);
  return { page, isOwner, appUser };
}

/** GET: 단일 레코드 조회 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId, model, id } = await context.params;
  if (!pageId || !model || !id) return apiErrorJson("bad_request", 400);

  const { page, isOwner, appUser } = await getPageAndAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);

  const coll = await getCollectionBySlug(pageId, model);
  if (!coll) return apiErrorJson("collection_not_found", 404);
  const fields = (coll.fields ?? []) as AppFieldDef[];
  const appUserField = getAppUserField(fields);
  const requiresAppUser = Boolean(appUserField);

  if (!isOwner && (page.is_hidden || page.status !== "live")) return apiErrorJson("not_found", 404);
  if (!isOwner && requiresAppUser && !appUser) return apiErrorJson("auth_required", 401);

  const record = await getRecord(pageId, model, id, {
    appUserId: !isOwner && requiresAppUser ? appUser?.id ?? null : null,
  });
  if (!record) return apiErrorJson("not_found", 404);

  return NextResponse.json({
    id: record.id,
    ...(record.data as object),
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

/** PATCH: 레코드 수정 (소유자만) */
export async function PATCH(req: Request, context: { params: Promise<Params> }) {
  const { pageId, model, id } = await context.params;
  if (!pageId || !model || !id) return apiErrorJson("bad_request", 400);

  const anonUserId = await resolveAnonUserId(req);
  const appUser = await resolveAppUserFromRequest(pageId, req);
  const user = anonUserId
    ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } })
    : null;

  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, status: true, is_hidden: true },
  });
  if (!page) return apiErrorJson("not_found", 404);
  const isOwner = Boolean(user && page.owner_id === user.id);
  if (!isOwner && !appUser) return apiErrorJson("auth_required", 401);
  if (!isOwner && (page.is_hidden || page.status !== "live")) return apiErrorJson("not_found", 404);

  const coll = await getCollectionBySlug(pageId, model);
  if (!coll) return apiErrorJson("collection_not_found", 404);
  const fields = (coll.fields ?? []) as AppFieldDef[];
  const appUserField = getAppUserField(fields);
  const requiresAppUser = Boolean(appUserField);

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const data = typeof parsed.data === "object" && parsed.data !== null ? parsed.data : {};
  if (!isOwner && appUser) {
    if (requiresAppUser) {
      if (!APP_USER_ALLOWED_TYPES.has(appUserField!.type)) {
        return apiErrorJson("invalid_app_user_field", 400, { detail: "app_user_id must be string or relation type" });
      }
    } else if (appUser.role !== "admin") {
      return apiErrorJson("permission_denied", 403, { detail: "app_user_admin_required" });
    }
  }

  const existing = await getRecord(pageId, model, id, {
    appUserId: !isOwner && requiresAppUser ? appUser?.id ?? null : null,
  });
  if (!existing) return apiErrorJson("not_found", 404);
  const merged = { ...(existing.data as Record<string, unknown>), ...(data as Record<string, unknown>) };
  if (!isOwner && appUser && requiresAppUser) {
    (merged as Record<string, unknown>)[APP_USER_FIELD] = appUser.id;
  }
  const strict = Boolean((coll as { strict?: boolean }).strict);
  const validated = validateRecordData(fields, merged, { mode: "update", strict });
  if (validated.errors.length) {
    return apiErrorJson("validation_failed", 400, { detail: validated.errors });
  }
  const appUserIdForRecord = requiresAppUser ? (validated.data?.[APP_USER_FIELD] as string | undefined) : undefined;
  const updateOptions = requiresAppUser ? { replace: true, appUserId: appUserIdForRecord ?? null } : { replace: true };
  const record = await updateRecord(
    pageId,
    model,
    id,
    validated.data as Record<string, unknown>,
    updateOptions,
    { userId: user?.id, anonId: anonUserId ?? undefined, appUserId: appUser?.id },
  );
  if (!record) return apiErrorJson("not_found", 404);
  const changedFields = Object.keys(data as Record<string, unknown>);
  await logAppAudit({
    pageId,
    action: "record_update",
    targetType: "record",
    targetId: record.id,
    meta: { collection: model, changed_fields: changedFields },
    actor: { userId: user?.id, anonId: anonUserId ?? undefined, appUserId: appUser?.id },
  });
  const triggerData = {
    id: record.id,
    pageId,
    page_id: pageId,
    collection: model,
    collection_slug: model,
    changed_fields: changedFields,
    ...(record.data as Record<string, unknown>),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
  await triggerWorkflowsForEvent(
    pageId,
    "record_updated",
    { collection: model, field: changedFields.length === 1 ? changedFields[0] : "" },
    triggerData
  );

  return NextResponse.json({
    id: record.id,
    ...(record.data as object),
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

/** DELETE: 레코드 삭제 (소유자만) */
export async function DELETE(req: Request, context: { params: Promise<Params> }) {
  const { pageId, model, id } = await context.params;
  if (!pageId || !model || !id) return apiErrorJson("bad_request", 400);

  const anonUserId = await resolveAnonUserId(req);
  const appUser = await resolveAppUserFromRequest(pageId, req);
  const user = anonUserId
    ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } })
    : null;

  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, status: true, is_hidden: true },
  });
  if (!page) return apiErrorJson("not_found", 404);
  const isOwner = Boolean(user && page.owner_id === user.id);
  if (!isOwner && !appUser) return apiErrorJson("auth_required", 401);
  if (!isOwner && (page.is_hidden || page.status !== "live")) return apiErrorJson("not_found", 404);

  const coll = await getCollectionBySlug(pageId, model);
  if (!coll) return apiErrorJson("collection_not_found", 404);
  const fields = (coll.fields ?? []) as AppFieldDef[];
  const appUserField = getAppUserField(fields);
  const requiresAppUser = Boolean(appUserField);
  if (!isOwner && appUser) {
    if (requiresAppUser) {
      if (!APP_USER_ALLOWED_TYPES.has(appUserField!.type)) {
        return apiErrorJson("invalid_app_user_field", 400, { detail: "app_user_id must be string or relation type" });
      }
    } else if (appUser.role !== "admin") {
      return apiErrorJson("permission_denied", 403, { detail: "app_user_admin_required" });
    }
  }

  const existing = await getRecord(pageId, model, id, {
    appUserId: !isOwner && requiresAppUser ? appUser?.id ?? null : null,
  });
  if (!existing) return apiErrorJson("not_found", 404);

  const record = await deleteRecord(pageId, model, id, {
    userId: user?.id,
    anonId: anonUserId ?? undefined,
    appUserId: appUser?.id,
  });
  if (!record) return apiErrorJson("not_found", 404);
  await logAppAudit({
    pageId,
    action: "record_delete",
    targetType: "record",
    targetId: record.id,
    meta: { collection: model },
    actor: { userId: user?.id, anonId: anonUserId ?? undefined, appUserId: appUser?.id },
  });
  const triggerData = {
    id: record.id,
    pageId,
    page_id: pageId,
    collection: model,
    collection_slug: model,
    ...(record.data as Record<string, unknown>),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
  await triggerWorkflowsForEvent(pageId, "record_deleted", { collection: model }, triggerData);

  return NextResponse.json({ ok: true, id: record.id });
}
