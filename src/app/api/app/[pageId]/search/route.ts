import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import { ensureDevCollections, readEnvFromRequest, resolveAppEnv } from "@/lib/app-env";
import {
  ensureDefaultServiceSearchIndices,
  listServiceSearchIndices,
  queryServiceSearch,
  reindexServiceSearchIndices,
  scheduleServiceSearchReindex,
  syncServiceSearchRecord,
  upsertServiceSearchIndex,
} from "@/lib/service-search";
import { canAccessPublishedPage } from "@/lib/page-access";

type Params = { pageId: string };

async function getPageAccess(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: {
      id: true,
      owner_id: true,
      owner: { select: { anon_id: true } },
      status: true,
      is_hidden: true,
      live_expires_at: true,
      deployed_at: true,
    },
  });
  const appUser = page ? await resolveAppUserFromRequest(pageId, req) : null;
  const isOwner = Boolean(page && anonUserId && page.owner.anon_id === anonUserId);
  return { page, appUser, isOwner };
}

function parseFacetFilters(url: URL) {
  const filters: Record<string, string | number | boolean> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!key.startsWith("facet.")) continue;
    const field = key.slice("facet.".length).trim();
    if (!field) continue;
    if (value === "true") filters[field] = true;
    else if (value === "false") filters[field] = false;
    else if (!Number.isNaN(Number(value)) && value.trim() !== "") filters[field] = Number(value);
    else filters[field] = value;
  }
  return filters;
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { page, appUser, isOwner } = await getPageAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);
  if (!canAccessPublishedPage(page, isOwner)) return apiErrorJson("not_found", 404);

  const env = await resolveAppEnv(pageId, { isOwner, requestEnv: readEnvFromRequest(req) });
  if (env === "dev" && isOwner) {
    await ensureDevCollections(pageId);
  }

  const url = new URL(req.url);
  const view = (url.searchParams.get("view") ?? "").trim().toLowerCase();
  if (view === "indices") {
    await ensureDefaultServiceSearchIndices(pageId);
    const indices = await listServiceSearchIndices(pageId);
    return NextResponse.json({
      items: indices.filter((index) => index.enabled),
    });
  }

  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ items: [], total: 0, limit: 0, offset: 0 });

  const indexKeys = (url.searchParams.get("index") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const sourceTypeRaw = (url.searchParams.get("sourceType") ?? "").trim();
  const sourceType = sourceTypeRaw === "page_entity" || sourceTypeRaw === "app_collection" ? sourceTypeRaw : undefined;
  const result = await queryServiceSearch(
    pageId,
    {
      q,
      indexKeys: indexKeys.length ? indexKeys : undefined,
      sourceType,
      filters: parseFacetFilters(url),
      limit: Number(url.searchParams.get("limit") ?? "20"),
      offset: Number(url.searchParams.get("offset") ?? "0"),
      orderBy: (url.searchParams.get("orderBy") as
        | "relevance"
        | "updated_at"
        | "sort_date"
        | "sort_number"
        | "sort_text"
        | null) ?? undefined,
      orderDir: (url.searchParams.get("orderDir") as "asc" | "desc" | null) ?? undefined,
      env,
    },
    {
      isOwner,
      appUserId: appUser?.id ?? null,
      env,
    },
  );

  return NextResponse.json(result);
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { page, appUser, isOwner } = await getPageAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);

  const env = await resolveAppEnv(pageId, { isOwner, requestEnv: readEnvFromRequest(req) });
  if (env === "dev" && isOwner) {
    await ensureDevCollections(pageId);
  }

  const url = new URL(req.url);
  const action = (url.searchParams.get("action") ?? req.headers.get("x-null-action") ?? "").trim().toLowerCase();
  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  if (action === "reindex") {
    if (!isOwner) return apiErrorJson("permission_denied", 403);
    const indexKeys = Array.isArray(body.indexKeys)
      ? body.indexKeys.map((value) => String(value)).filter(Boolean)
      : typeof body.indexKey === "string" && body.indexKey.trim()
        ? [body.indexKey.trim()]
        : [];
    const asyncMode = body.async !== false;
    if (asyncMode) {
      await scheduleServiceSearchReindex({ pageId, indexKeys, env });
      return NextResponse.json({ ok: true, scheduled: true, indexKeys });
    }
    const result = await reindexServiceSearchIndices({
      pageId,
      indexKeys,
      env,
      actor: { anonId: page.owner?.anon_id ?? undefined },
    });
    return NextResponse.json({ ok: true, scheduled: false, ...result });
  }

  if (action === "sync_record") {
    if (!isOwner && !appUser) return apiErrorJson("auth_required", 401);
    const collectionSlug = typeof body.collectionSlug === "string" ? body.collectionSlug.trim() : "";
    const recordId = typeof body.recordId === "string" ? body.recordId.trim() : "";
    if (!collectionSlug || !recordId) return apiErrorJson("bad_request", 400);
    await syncServiceSearchRecord({ pageId, collectionSlug, recordId });
    return NextResponse.json({ ok: true });
  }

  if (action === "define_index") {
    if (!isOwner) return apiErrorJson("permission_denied", 403);
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sourceType =
      body.sourceType === "page_entity" || body.sourceType === "app_collection"
        ? body.sourceType
        : null;
    const sourceKey = typeof body.sourceKey === "string" ? body.sourceKey.trim() : "";
    if (!key || !name || !sourceType || !sourceKey) return apiErrorJson("bad_request", 400);
    const index = await upsertServiceSearchIndex({
      pageId,
      key,
      name,
      sourceType,
      sourceKey,
      titleFields: Array.isArray(body.titleFields) ? body.titleFields.map((value) => String(value)) : [],
      bodyFields: Array.isArray(body.bodyFields) ? body.bodyFields.map((value) => String(value)) : [],
      facetFields: Array.isArray(body.facetFields) ? body.facetFields.map((value) => String(value)) : [],
      sortField: typeof body.sortField === "string" ? body.sortField : null,
      visibility:
        body.visibility === "owner" || body.visibility === "app_user" || body.visibility === "public"
          ? body.visibility
          : "owner",
      scopeMode: body.scopeMode === "own" ? "own" : "all",
      enabled: body.enabled !== false,
      config: body.config && typeof body.config === "object" && !Array.isArray(body.config)
        ? (body.config as Record<string, unknown>)
        : {},
      actor: { anonId: page.owner?.anon_id ?? undefined },
    });
    return NextResponse.json({ ok: true, index });
  }

  return apiErrorJson("bad_action", 400);
}
