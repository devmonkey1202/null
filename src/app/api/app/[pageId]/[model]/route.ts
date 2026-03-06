import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getCollectionBySlug, listRecords, createRecord, validateRecordData, type AppFieldDef } from "@/lib/app-data";
import { logAppAudit } from "@/lib/app-audit";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { handleAppRecordQuery } from "@/lib/app-record-query";

type Params = { pageId: string; model: string };

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

/** GET: 해당 모델(컬렉션) 레코드 목록 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId, model } = await context.params;
  if (!pageId || !model) return apiErrorJson("bad_request", 400);

  const { page, isOwner, appUser } = await getPageAndAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);

  const coll = await getCollectionBySlug(pageId, model);
  if (!coll) return apiErrorJson("collection_not_found", 404);
  const fields = (coll.fields ?? []) as AppFieldDef[];
  const appUserField = getAppUserField(fields);
  const requiresAppUser = Boolean(appUserField);

  if (!isOwner && (page.is_hidden || page.status !== "live")) return apiErrorJson("not_found", 404);
  if (!isOwner && requiresAppUser && !appUser) return apiErrorJson("auth_required", 401);

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  const orderBy = (url.searchParams.get("orderBy") === "updated_at" ? "updated_at" : "created_at") as
    | "created_at"
    | "updated_at";
  const orderDir = url.searchParams.get("orderDir") === "asc" ? "asc" : "desc";

  const result = await listRecords(pageId, model, {
    limit,
    offset,
    orderBy,
    orderDir,
    appUserId: !isOwner && requiresAppUser ? appUser?.id ?? null : null,
  });
  return NextResponse.json({
    items: result.items.map((r) => ({
      id: r.id,
      ...(r.data as object),
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  });
}

/** POST: 레코드 생성 (소유자만) */
export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId, model } = await context.params;
  if (!pageId || !model) return apiErrorJson("bad_request", 400);

  const url = new URL(req.url, "http://localhost");
  const action = url.searchParams.get("action") ?? req.headers.get("x-null-action");
  if (action === "query") {
    return handleAppRecordQuery(req, pageId, model);
  }

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
  if (!isOwner && page.is_hidden) return apiErrorJson("not_found", 404);
  if (!isOwner && page.status !== "live") return apiErrorJson("not_found", 404);

  const coll = await getCollectionBySlug(pageId, model);
  if (!coll) return apiErrorJson("collection_not_found", 404);

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const input = typeof parsed.data === "object" && parsed.data !== null ? parsed.data : {};
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
  const data =
    !isOwner && appUser && requiresAppUser
      ? { ...(input as Record<string, unknown>), [APP_USER_FIELD]: appUser.id }
      : input;

  const strict = Boolean((coll as { strict?: boolean }).strict);
  const validated = validateRecordData(fields, data as Record<string, unknown>, { mode: "create", strict });
  if (validated.errors.length) {
    return apiErrorJson("validation_failed", 400, { detail: validated.errors });
  }
  const appUserIdForRecord = requiresAppUser ? (validated.data?.[APP_USER_FIELD] as string | undefined) : undefined;
  const createOptions = requiresAppUser ? { appUserId: appUserIdForRecord ?? null } : undefined;
  const record = await createRecord(
    pageId,
    model,
    validated.data as Record<string, unknown>,
    {
      userId: user?.id,
      anonId: anonUserId ?? undefined,
      appUserId: appUser?.id,
    },
    createOptions
  );
  await logAppAudit({
    pageId,
    action: "record_create",
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
  await triggerWorkflowsForEvent(pageId, "record_created", { collection: model }, triggerData);
  return NextResponse.json({
    id: record.id,
    ...(record.data as object),
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}
