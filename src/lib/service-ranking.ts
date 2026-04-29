import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/background-jobs";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { registerBackgroundJobHandler } from "@/lib/service-runtime";
import { applyServiceRankingRuntimeExtensions } from "@/lib/service-runtime-extensions";
import { isDevSlug, type AppEnv } from "@/lib/app-env";
import type { AppFieldDef } from "@/lib/app-data";

export type ServiceRankingVisibility = "owner" | "app_user" | "public";
export type ServiceRankingScope = "all" | "own";
export type ServiceRankingSourceType = "app_collection";

export type ServiceRankingAccess = {
  isOwner: boolean;
  appUserId?: string | null;
  env?: AppEnv;
};

export type ServiceRankingQueryInput = {
  ruleKeys?: string[];
  filters?: Record<string, string | number | boolean>;
  limit?: number;
  offset?: number;
  orderDir?: "asc" | "desc";
  env?: AppEnv;
};

type RankingRuleConfig = {
  numericWeights: Record<string, number>;
  booleanBonuses: Record<string, number>;
  freshnessField: string;
  freshnessHalfLifeHours: number;
};

type RankingSnapshotSeed = {
  sourceId: string;
  title?: string | null;
  excerpt?: string | null;
  score: number;
  rank?: number | null;
  facets?: Record<string, string | number | boolean | null>;
  appUserId?: string | null;
  payload?: Record<string, unknown>;
};

type PersistedRule = Awaited<ReturnType<typeof listServiceRankingRules>>[number];
type PersistedSnapshot = {
  id: string;
  page_id: string;
  rule_id: string;
  source_type: string;
  source_key: string;
  source_id: string;
  title: string | null;
  excerpt: string | null;
  score: number;
  rank: number | null;
  facets: Prisma.JsonValue | null;
  app_user_id: string | null;
  payload: Prisma.JsonValue | null;
  updated_at: Date;
};

function resolveFeedEntityKey(snapshot: PersistedSnapshot) {
  const payload = normalizePayload(snapshot.payload);
  const explicitKey =
    typeof payload.feedEntityKey === "string"
      ? payload.feedEntityKey.trim()
      : typeof payload.entityKey === "string"
        ? payload.entityKey.trim()
        : "";
  if (explicitKey) return explicitKey;
  return `${snapshot.source_type}:${snapshot.source_id}`;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value as number), min), max);
}

function normalizeFacetValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function normalizePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeFacets(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(input).map(([key, facetValue]) => [key, normalizeFacetValue(facetValue)]),
  ) as Record<string, string | number | boolean | null>;
}

function indexEnabled(rule: { enabled: boolean; source_key: string }, env: AppEnv) {
  return rule.enabled && (env === "dev" ? isDevSlug(rule.source_key) : !isDevSlug(rule.source_key));
}

function canAccessRule(rule: { visibility: string }, access: ServiceRankingAccess) {
  if (access.isOwner) return true;
  if (rule.visibility === "public") return true;
  if (rule.visibility === "app_user" && access.appUserId) return true;
  return false;
}

function canAccessSnapshot(rule: { scope_mode: string }, snapshot: { app_user_id: string | null }, access: ServiceRankingAccess) {
  if (access.isOwner) return true;
  if (rule.scope_mode !== "own") return true;
  return Boolean(access.appUserId && snapshot.app_user_id === access.appUserId);
}

function matchesFacetFilters(
  facets: Record<string, string | number | boolean | null>,
  filters: Record<string, string | number | boolean>,
) {
  return Object.entries(filters).every(([key, value]) => {
    const facet = facets[key];
    if (facet === null || facet === undefined) return false;
    return String(facet) === String(value);
  });
}

function extractStringFields(fields: AppFieldDef[]) {
  return fields.filter((field) => field.type === "string").map((field) => field.name);
}

function preferredTitleFields(fields: AppFieldDef[]) {
  const names = extractStringFields(fields);
  const priorities = ["title", "name", "label", "headline", "subject"];
  const picked = priorities.find((field) => names.includes(field));
  return picked ? [picked] : names.slice(0, 1);
}

function preferredExcerptFields(fields: AppFieldDef[], titleFields: string[]) {
  const names = extractStringFields(fields);
  const excerpt = names.filter((field) => !titleFields.includes(field));
  return excerpt.length ? excerpt.slice(0, 2) : titleFields;
}

function preferredFacetFields(fields: AppFieldDef[]) {
  return fields
    .filter((field) => field.type === "boolean" || field.type === "number" || field.type === "date")
    .map((field) => field.name)
    .slice(0, 8);
}

function detectRuleConfig(fields: AppFieldDef[]): RankingRuleConfig {
  const numericWeights: Record<string, number> = {};
  const booleanBonuses: Record<string, number> = {};
  const names = new Set(fields.map((field) => field.name));

  const numericCandidates: Array<[string, number]> = [
    ["score", 5],
    ["priority", 4],
    ["weight", 3],
    ["popularity", 3],
    ["views", 1],
    ["view_count", 1],
    ["upvotes", 2],
    ["upvote_count", 2],
    ["likes", 1.5],
    ["like_count", 1.5],
  ];
  for (const [field, weight] of numericCandidates) {
    if (names.has(field)) numericWeights[field] = weight;
  }
  if (names.has("rank")) numericWeights.rank = -2;

  const booleanCandidates: Array<[string, number]> = [
    ["featured", 10],
    ["pinned", 8],
    ["trending", 6],
    ["recommended", 5],
  ];
  for (const [field, bonus] of booleanCandidates) {
    if (names.has(field)) booleanBonuses[field] = bonus;
  }

  return {
    numericWeights,
    booleanBonuses,
    freshnessField: names.has("published_at") ? "published_at" : "updated_at",
    freshnessHalfLifeHours: 72,
  };
}

function toTextParts(record: Record<string, unknown>, fields: string[]) {
  return fields
    .map((field) => {
      const value = record[field];
      if (typeof value === "string") return value.trim();
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return "";
    })
    .filter(Boolean);
}

function toFacets(record: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, normalizeFacetValue(record[field])])) as Record<
    string,
    string | number | boolean | null
  >;
}

function computeFreshnessScore(value: unknown, halfLifeHours: number) {
  const ts =
    typeof value === "string" || value instanceof Date
      ? new Date(value).getTime()
      : typeof value === "number"
        ? value
        : Number.NaN;
  if (!Number.isFinite(ts)) return 0;
  const ageHours = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
  return Math.exp(-ageHours / Math.max(1, halfLifeHours)) * 3;
}

function computeRuleScore(record: Record<string, unknown>, config: RankingRuleConfig) {
  let score = computeFreshnessScore(record[config.freshnessField], config.freshnessHalfLifeHours);
  for (const [field, weight] of Object.entries(config.numericWeights)) {
    const raw = record[field];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) continue;
    if (field === "rank") {
      score += Math.log1p(Math.max(1, value)) * weight;
      continue;
    }
    score += Math.log1p(Math.max(0, value)) * weight;
  }
  for (const [field, bonus] of Object.entries(config.booleanBonuses)) {
    if (record[field] === true) score += bonus;
  }
  return score;
}

function rankingRuleKeyForCollection(slug: string) {
  return `collection:${slug}:default`;
}

export async function listServiceRankingRules(pageId: string) {
  return prisma.serviceRankingRule.findMany({
    where: { page_id: pageId },
    orderBy: [{ source_type: "asc" }, { source_key: "asc" }],
  });
}

export async function ensureDefaultServiceRankingRules(pageId: string) {
  const collections = await prisma.appCollection.findMany({
    where: { page_id: pageId },
    orderBy: { slug: "asc" },
  });
  for (const collection of collections) {
    const fields = Array.isArray(collection.fields) ? (collection.fields as unknown as AppFieldDef[]) : [];
    const titleFields = preferredTitleFields(fields);
    const excerptFields = preferredExcerptFields(fields, titleFields);
    const facetFields = preferredFacetFields(fields);
    const hasAppUserField = fields.some((field) => field.name === "app_user_id");
    const visibility: ServiceRankingVisibility = hasAppUserField ? "app_user" : "owner";
    const scopeMode: ServiceRankingScope = hasAppUserField ? "own" : "all";
    const config = detectRuleConfig(fields);
    await prisma.serviceRankingRule.upsert({
      where: { page_id_key: { page_id: pageId, key: rankingRuleKeyForCollection(collection.slug) } },
      update: {
        name: `${collection.name} ranking`,
        source_type: "app_collection",
        source_key: collection.slug,
        title_fields: titleFields,
        excerpt_fields: excerptFields,
        facet_fields: facetFields,
        visibility,
        scope_mode: scopeMode,
        enabled: true,
        config: config as Prisma.InputJsonValue,
      },
      create: {
        page_id: pageId,
        key: rankingRuleKeyForCollection(collection.slug),
        name: `${collection.name} ranking`,
        source_type: "app_collection",
        source_key: collection.slug,
        title_fields: titleFields,
        excerpt_fields: excerptFields,
        facet_fields: facetFields,
        visibility,
        scope_mode: scopeMode,
        enabled: true,
        config: config as Prisma.InputJsonValue,
      },
    });
  }
}

async function buildCollectionSnapshots(
  pageId: string,
  rule: {
    source_key: string;
    title_fields: unknown;
    excerpt_fields: unknown;
    facet_fields: unknown;
    config: Prisma.JsonValue | null;
  },
  options?: { recordIds?: string[] },
): Promise<RankingSnapshotSeed[]> {
  const records = await prisma.appRecord.findMany({
    where: {
      page_id: pageId,
      collection_slug: rule.source_key,
      ...(options?.recordIds?.length ? { id: { in: options.recordIds } } : {}),
    },
    orderBy: { updated_at: "desc" },
    select: { id: true, data: true, updated_at: true, created_at: true, app_user_id: true },
  });
  const titleFields = Array.isArray(rule.title_fields) ? rule.title_fields.map((value) => String(value)) : [];
  const excerptFields = Array.isArray(rule.excerpt_fields) ? rule.excerpt_fields.map((value) => String(value)) : [];
  const facetFields = Array.isArray(rule.facet_fields) ? rule.facet_fields.map((value) => String(value)) : [];
  const config = normalizePayload(rule.config) as unknown as RankingRuleConfig;
  return records.map((record) => {
    const data = normalizePayload(record.data);
    const sourceData = {
      ...data,
      created_at: record.created_at.toISOString(),
      updated_at: record.updated_at.toISOString(),
    };
    const title = toTextParts(data, titleFields).join(" ").trim() || null;
    const excerpt = toTextParts(data, excerptFields).join(" ").trim() || title;
    const score = computeRuleScore(sourceData, {
      numericWeights: normalizePayload(config.numericWeights) as Record<string, number>,
      booleanBonuses: normalizePayload(config.booleanBonuses) as Record<string, number>,
      freshnessField: typeof config.freshnessField === "string" ? config.freshnessField : "updated_at",
      freshnessHalfLifeHours:
        typeof config.freshnessHalfLifeHours === "number" ? config.freshnessHalfLifeHours : 72,
    });
    return {
      sourceId: record.id,
      title,
      excerpt,
      score,
      facets: toFacets(data, facetFields),
      appUserId: record.app_user_id,
      payload: {
        collectionSlug: rule.source_key,
        createdAt: record.created_at.toISOString(),
        updatedAt: record.updated_at.toISOString(),
      },
    };
  });
}

function applyRanks(items: RankingSnapshotSeed[]) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  return sorted.map((item, index) => ({ ...item, rank: index + 1 }));
}

async function replaceSnapshotsForRule(
  pageId: string,
  rule: { id: string; source_type: string; source_key: string },
  items: RankingSnapshotSeed[],
) {
  const ranked = applyRanks(items);
  await prisma.$transaction(async (tx) => {
    await tx.serviceRankingSnapshot.deleteMany({ where: { page_id: pageId, rule_id: rule.id } });
    if (!ranked.length) return;
    await tx.serviceRankingSnapshot.createMany({
      data: ranked.map((item) => ({
        page_id: pageId,
        rule_id: rule.id,
        source_type: rule.source_type,
        source_key: rule.source_key,
        source_id: item.sourceId,
        title: item.title ?? null,
        excerpt: item.excerpt ?? null,
        score: item.score,
        rank: item.rank ?? null,
        facets: (item.facets ?? {}) as Prisma.InputJsonValue,
        app_user_id: item.appUserId ?? null,
        payload: (item.payload ?? {}) as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  });
}

async function upsertSnapshotsForRule(
  pageId: string,
  rule: { id: string; source_type: string; source_key: string },
  items: RankingSnapshotSeed[],
) {
  for (const item of items) {
    await prisma.serviceRankingSnapshot.upsert({
      where: { rule_id_source_id: { rule_id: rule.id, source_id: item.sourceId } },
      update: {
        title: item.title ?? null,
        excerpt: item.excerpt ?? null,
        score: item.score,
        facets: (item.facets ?? {}) as Prisma.InputJsonValue,
        app_user_id: item.appUserId ?? null,
        payload: (item.payload ?? {}) as Prisma.InputJsonValue,
      },
      create: {
        page_id: pageId,
        rule_id: rule.id,
        source_type: rule.source_type,
        source_key: rule.source_key,
        source_id: item.sourceId,
        title: item.title ?? null,
        excerpt: item.excerpt ?? null,
        score: item.score,
        rank: item.rank ?? null,
        facets: (item.facets ?? {}) as Prisma.InputJsonValue,
        app_user_id: item.appUserId ?? null,
        payload: (item.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

export async function recomputeServiceRanking(input: {
  pageId: string;
  ruleKeys?: string[];
  env?: AppEnv;
  actor?: AppAuditActor;
}) {
  await ensureDefaultServiceRankingRules(input.pageId);
  const env = input.env ?? "prod";
  const rules = await prisma.serviceRankingRule.findMany({
    where: {
      page_id: input.pageId,
      ...(input.ruleKeys?.length ? { key: { in: input.ruleKeys } } : {}),
    },
    orderBy: { key: "asc" },
  });
  const targetRules = rules.filter((rule) => indexEnabled(rule, env));
  let itemCount = 0;
  for (const rule of targetRules) {
    const items = await buildCollectionSnapshots(input.pageId, rule);
    await replaceSnapshotsForRule(input.pageId, rule, items);
    itemCount += items.length;
  }
  if (targetRules.length) {
    await logAppAudit({
      pageId: input.pageId,
      action: "service_ranking_recompute",
      targetType: "service_ranking",
      targetId: targetRules.map((rule) => rule.key).join(","),
      actor: input.actor,
      meta: { ruleKeys: targetRules.map((rule) => rule.key), env, items: itemCount },
    });
  }
  return { rules: targetRules.length, items: itemCount };
}

export async function scheduleServiceRankingRecompute(input: {
  pageId: string;
  ruleKeys?: string[];
  env?: AppEnv;
}) {
  await enqueueJob({
    pageId: input.pageId,
    queue: "ranking",
    type: "service-ranking-recompute",
    payload: {
      ruleKeys: input.ruleKeys ?? null,
      env: input.env ?? "prod",
    },
    priority: 70,
    dedupeKey: `service-ranking-recompute:${input.pageId}:${input.env ?? "prod"}:${(input.ruleKeys ?? []).slice().sort().join(",")}`,
    maxAttempts: 2,
  });
}

export async function syncServiceRankingRecord(input: {
  pageId: string;
  collectionSlug: string;
  recordId: string;
}) {
  const rules = await prisma.serviceRankingRule.findMany({
    where: {
      page_id: input.pageId,
      source_type: "app_collection",
      source_key: input.collectionSlug,
      enabled: true,
    },
  });
  const touchedRuleKeys: string[] = [];
  for (const rule of rules) {
    const items = await buildCollectionSnapshots(input.pageId, rule, { recordIds: [input.recordId] });
    if (!items.length) {
      await prisma.serviceRankingSnapshot.deleteMany({
        where: { page_id: input.pageId, rule_id: rule.id, source_id: input.recordId },
      });
    } else {
      await upsertSnapshotsForRule(input.pageId, rule, items);
      touchedRuleKeys.push(rule.key);
    }
  }
  return touchedRuleKeys;
}

export async function deleteServiceRankingRecord(input: {
  pageId: string;
  collectionSlug: string;
  recordId: string;
}) {
  const rules = await prisma.serviceRankingRule.findMany({
    where: {
      page_id: input.pageId,
      source_type: "app_collection",
      source_key: input.collectionSlug,
      enabled: true,
    },
    select: { id: true, key: true },
  });
  await prisma.serviceRankingSnapshot.deleteMany({
    where: {
      page_id: input.pageId,
      source_type: "app_collection",
      source_key: input.collectionSlug,
      source_id: input.recordId,
    },
  });
  return rules.map((rule) => rule.key);
}

export async function ensureServiceRankingReady(pageId: string, env: AppEnv = "prod") {
  await ensureDefaultServiceRankingRules(pageId);
  const rules = await prisma.serviceRankingRule.findMany({ where: { page_id: pageId, enabled: true } });
  for (const rule of rules) {
    if (!indexEnabled(rule, env)) continue;
    const count = await prisma.serviceRankingSnapshot.count({ where: { page_id: pageId, rule_id: rule.id } });
    if (count > 0) continue;
    const items = await buildCollectionSnapshots(pageId, rule);
    await replaceSnapshotsForRule(pageId, rule, items);
  }
}

export async function queryServiceRanking(
  pageId: string,
  input: ServiceRankingQueryInput,
  access: ServiceRankingAccess,
) {
  const env = input.env ?? access.env ?? "prod";
  await ensureServiceRankingReady(pageId, env);

  const rules = (await prisma.serviceRankingRule.findMany({
    where: {
      page_id: pageId,
      enabled: true,
      ...(input.ruleKeys?.length ? { key: { in: input.ruleKeys } } : {}),
    },
    orderBy: { key: "asc" },
  })).filter((rule) => indexEnabled(rule, env) && canAccessRule(rule, access));
  if (!rules.length) {
    return { items: [] as Array<Record<string, unknown>>, total: 0, limit: 0, offset: 0 };
  }

  const limit = clamp(input.limit, 20, 1, 100);
  const offset = clamp(input.offset, 0, 0, 10_000);
  const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));

  const snapshots = (await prisma.serviceRankingSnapshot.findMany({
    where: {
      page_id: pageId,
      rule_id: { in: rules.map((rule) => rule.id) },
    },
    orderBy: [{ score: "desc" }, { updated_at: "desc" }],
    take: 1000,
  })) as PersistedSnapshot[];

  const filters = input.filters ?? {};
  const filtered = snapshots
    .map((snapshot) => {
      const rule = ruleMap.get(snapshot.rule_id);
      if (!rule) return null;
      if (!canAccessSnapshot(rule, snapshot, access)) return null;
      const facets = normalizeFacets(snapshot.facets);
      if (!matchesFacetFilters(facets, filters)) return null;
      return { snapshot, rule, facets };
    })
    .filter((row): row is { snapshot: PersistedSnapshot; rule: PersistedRule; facets: Record<string, string | number | boolean | null> } => Boolean(row));

  filtered.sort((a, b) => {
    const scoreDiff =
      input.orderDir === "asc" ? a.snapshot.score - b.snapshot.score : b.snapshot.score - a.snapshot.score;
    if (scoreDiff !== 0) return scoreDiff;
    return (a.snapshot.rank ?? Number.MAX_SAFE_INTEGER) - (b.snapshot.rank ?? Number.MAX_SAFE_INTEGER);
  });

  const items = filtered.slice(offset, offset + limit).map(({ snapshot, rule, facets }) => ({
    id: snapshot.id,
    ruleKey: rule.key,
    ruleName: rule.name,
    sourceType: snapshot.source_type,
    sourceKey: snapshot.source_key,
    sourceId: snapshot.source_id,
    title: snapshot.title ?? rule.name,
    excerpt: snapshot.excerpt ?? "",
    score: snapshot.score,
    rank: snapshot.rank ?? null,
    facets,
    payload: normalizePayload(snapshot.payload),
    updatedAt: snapshot.updated_at.toISOString(),
  }));

  const result = {
    items,
    total: filtered.length,
    limit,
    offset,
  };
  return applyServiceRankingRuntimeExtensions(pageId, result, {
    pageId,
    query: input,
    access,
    ruleKeys: rules.map((rule) => rule.key),
    filters,
  });
}

export async function assembleServiceFeed(
  pageId: string,
  input: {
    ruleWeights: Array<{ ruleKey: string; weight?: number }>;
    limit?: number;
    offset?: number;
  },
  access: ServiceRankingAccess,
) {
  const env = access.env ?? "prod";
  await ensureServiceRankingReady(pageId, env);
  const rules = (await prisma.serviceRankingRule.findMany({
    where: {
      page_id: pageId,
      enabled: true,
      key: { in: input.ruleWeights.map((item) => item.ruleKey) },
    },
  })).filter((rule) => indexEnabled(rule, env) && canAccessRule(rule, access));
  const snapshots = (await prisma.serviceRankingSnapshot.findMany({
    where: {
      page_id: pageId,
      rule_id: { in: rules.map((rule) => rule.id) },
    },
    take: 1000,
  })) as PersistedSnapshot[];

  const grouped = new Map<
    string,
    {
      sourceId: string;
      sourceType: string;
      sourceKey: string;
      title: string;
      excerpt: string;
      score: number;
      payload: Record<string, unknown>;
      facets: Record<string, string | number | boolean | null>;
      contributingRules: string[];
      updatedAt: Date;
    }
  >();

  for (const snapshot of snapshots) {
    const rule = rules.find((item) => item.id === snapshot.rule_id);
    if (!rule) continue;
    if (!canAccessSnapshot(rule, snapshot, access)) continue;
    const weight = input.ruleWeights.find((item) => item.ruleKey === rule.key)?.weight ?? 1;
    const key = resolveFeedEntityKey(snapshot);
    const current = grouped.get(key);
    const contribution = snapshot.score * weight;
    if (!current) {
      grouped.set(key, {
        sourceId: snapshot.source_id,
        sourceType: snapshot.source_type,
        sourceKey: snapshot.source_key,
        title: snapshot.title ?? rule.name,
        excerpt: snapshot.excerpt ?? "",
        score: contribution,
        payload: normalizePayload(snapshot.payload),
        facets: normalizeFacets(snapshot.facets),
        contributingRules: [rule.key],
        updatedAt: snapshot.updated_at,
      });
      continue;
    }
    current.score += contribution;
    current.updatedAt = current.updatedAt > snapshot.updated_at ? current.updatedAt : snapshot.updated_at;
    if (!current.contributingRules.includes(rule.key)) current.contributingRules.push(rule.key);
  }

  const limit = clamp(input.limit, 20, 1, 100);
  const offset = clamp(input.offset, 0, 0, 10_000);
  const items = Array.from(grouped.values())
    .sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(offset, offset + limit)
    .map((item, index) => ({
      ...item,
      rank: offset + index + 1,
      updatedAt: item.updatedAt.toISOString(),
    }));

  const result = {
    items,
    total: grouped.size,
    limit,
    offset,
  };
  return applyServiceRankingRuntimeExtensions(pageId, result, {
    pageId,
    feed: true,
    ruleWeights: input.ruleWeights,
    access,
  });
}

export async function upsertServiceRankingRule(input: {
  pageId: string;
  key: string;
  name: string;
  sourceKey: string;
  titleFields?: string[];
  excerptFields?: string[];
  facetFields?: string[];
  visibility?: ServiceRankingVisibility;
  scopeMode?: ServiceRankingScope;
  enabled?: boolean;
  config?: Record<string, unknown>;
  actor?: AppAuditActor;
}) {
  const rule = await prisma.serviceRankingRule.upsert({
    where: { page_id_key: { page_id: input.pageId, key: input.key } },
    update: {
      name: input.name,
      source_type: "app_collection",
      source_key: input.sourceKey,
      title_fields: input.titleFields ?? [],
      excerpt_fields: input.excerptFields ?? [],
      facet_fields: input.facetFields ?? [],
      visibility: input.visibility ?? "owner",
      scope_mode: input.scopeMode ?? "all",
      enabled: input.enabled ?? true,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
    },
    create: {
      page_id: input.pageId,
      key: input.key,
      name: input.name,
      source_type: "app_collection",
      source_key: input.sourceKey,
      title_fields: input.titleFields ?? [],
      excerpt_fields: input.excerptFields ?? [],
      facet_fields: input.facetFields ?? [],
      visibility: input.visibility ?? "owner",
      scope_mode: input.scopeMode ?? "all",
      enabled: input.enabled ?? true,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
    },
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_ranking_rule_upsert",
    targetType: "service_ranking_rule",
    targetId: rule.id,
    actor: input.actor,
    meta: { key: rule.key, sourceKey: rule.source_key },
  });
  return rule;
}

registerBackgroundJobHandler("service-ranking-recompute", async (job) => {
  if (!job.pageId) {
    return {
      ok: false,
      kind: "background_job",
      error: "service_ranking_recompute_missing_page",
      errorCode: "service_ranking_recompute_missing_page",
      logs: [],
    };
  }
  const payload = normalizePayload(job.payload);
  const ruleKeys = Array.isArray(payload.ruleKeys) ? payload.ruleKeys.map((value) => String(value)).filter(Boolean) : [];
  const env = payload.env === "dev" ? "dev" : "prod";
  const result = await recomputeServiceRanking({
    pageId: job.pageId,
    ruleKeys,
    env,
  });
  return {
    ok: true,
    kind: "background_job",
    data: result,
    logs: [`service_ranking_recompute:${result.rules}:${result.items}`],
  };
});
