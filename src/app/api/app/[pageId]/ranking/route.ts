import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import { ensureDevCollections, readEnvFromRequest, resolveAppEnv } from "@/lib/app-env";
import {
  assembleServiceFeed,
  ensureDefaultServiceRankingRules,
  listServiceRankingRules,
  queryServiceRanking,
  recomputeServiceRanking,
  scheduleServiceRankingRecompute,
  upsertServiceRankingRule,
} from "@/lib/service-ranking";
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
  const view = (url.searchParams.get("view") ?? "ranking").trim().toLowerCase();
  if (view === "rules") {
    await ensureDefaultServiceRankingRules(pageId);
    const rules = await listServiceRankingRules(pageId);
    return NextResponse.json({ items: rules });
  }

  const ruleKeys = (url.searchParams.get("rule") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const access = {
    isOwner,
    appUserId: appUser?.id ?? null,
    env,
  };

  if (view === "feed") {
    const weights = ruleKeys.map((ruleKey) => {
      const weightRaw = url.searchParams.get(`weight.${ruleKey}`);
      const weight = Number(weightRaw ?? "1");
      return { ruleKey, weight: Number.isFinite(weight) ? weight : 1 };
    });
    const result = await assembleServiceFeed(
      pageId,
      {
        ruleWeights: weights,
        limit: Number(url.searchParams.get("limit") ?? "20"),
        offset: Number(url.searchParams.get("offset") ?? "0"),
      },
      access,
    );
    return NextResponse.json(result);
  }

  const result = await queryServiceRanking(
    pageId,
    {
      ruleKeys: ruleKeys.length ? ruleKeys : undefined,
      filters: parseFacetFilters(url),
      limit: Number(url.searchParams.get("limit") ?? "20"),
      offset: Number(url.searchParams.get("offset") ?? "0"),
      orderDir: (url.searchParams.get("orderDir") as "asc" | "desc" | null) ?? undefined,
      env,
    },
    access,
  );
  return NextResponse.json(result);
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { page, isOwner } = await getPageAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);
  if (!isOwner) return apiErrorJson("permission_denied", 403);

  const env = await resolveAppEnv(pageId, { isOwner, requestEnv: readEnvFromRequest(req) });
  if (env === "dev" && isOwner) {
    await ensureDevCollections(pageId);
  }

  const url = new URL(req.url);
  const action = (url.searchParams.get("action") ?? req.headers.get("x-null-action") ?? "").trim().toLowerCase();
  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  if (action === "recompute") {
    const ruleKeys = Array.isArray(body.ruleKeys)
      ? body.ruleKeys.map((value) => String(value)).filter(Boolean)
      : typeof body.ruleKey === "string" && body.ruleKey.trim()
        ? [body.ruleKey.trim()]
        : [];
    const asyncMode = body.async !== false;
    if (asyncMode) {
      await scheduleServiceRankingRecompute({ pageId, ruleKeys, env });
      return NextResponse.json({ ok: true, scheduled: true, ruleKeys });
    }
    const result = await recomputeServiceRanking({ pageId, ruleKeys, env, actor: { anonId: page.owner.anon_id } });
    return NextResponse.json({ ok: true, scheduled: false, ...result });
  }

  if (action === "define_rule") {
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sourceKey = typeof body.sourceKey === "string" ? body.sourceKey.trim() : "";
    if (!key || !name || !sourceKey) return apiErrorJson("bad_request", 400);
    const rule = await upsertServiceRankingRule({
      pageId,
      key,
      name,
      sourceKey,
      titleFields: Array.isArray(body.titleFields) ? body.titleFields.map((value) => String(value)) : [],
      excerptFields: Array.isArray(body.excerptFields) ? body.excerptFields.map((value) => String(value)) : [],
      facetFields: Array.isArray(body.facetFields) ? body.facetFields.map((value) => String(value)) : [],
      visibility:
        body.visibility === "owner" || body.visibility === "app_user" || body.visibility === "public"
          ? body.visibility
          : "owner",
      scopeMode: body.scopeMode === "own" ? "own" : "all",
      enabled: body.enabled !== false,
      config: body.config && typeof body.config === "object" && !Array.isArray(body.config)
        ? (body.config as Record<string, unknown>)
        : {},
      actor: { anonId: page.owner.anon_id },
    });
    return NextResponse.json({ ok: true, rule });
  }

  return apiErrorJson("bad_action", 400);
}
