import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/background-jobs";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { registerBackgroundJobHandler } from "@/lib/service-runtime";
import { applyServiceSearchRuntimeExtensions } from "@/lib/service-runtime-extensions";
import { isDevSlug, type AppEnv } from "@/lib/app-env";
import type { AppFieldDef } from "@/lib/app-data";

export type ServiceSearchVisibility = "owner" | "app_user" | "public";
export type ServiceSearchScope = "all" | "own";
export type ServiceSearchSourceType = "page_entity" | "app_collection";
export type ServiceSearchBuiltinEntity = "comments" | "chat" | "todos" | "notes" | "calendar";

export type ServiceSearchAccess = {
  isOwner: boolean;
  appUserId?: string | null;
  env?: AppEnv;
};

export type ServiceSearchQueryInput = {
  q: string;
  indexKeys?: string[];
  filters?: Record<string, string | number | boolean>;
  sourceType?: ServiceSearchSourceType;
  limit?: number;
  offset?: number;
  orderBy?: "relevance" | "updated_at" | "sort_date" | "sort_number" | "sort_text";
  orderDir?: "asc" | "desc";
  env?: AppEnv;
};

export type ServiceSearchDocumentResult = {
  id: string;
  indexKey: string;
  indexName: string;
  sourceType: ServiceSearchSourceType;
  sourceKey: string;
  sourceId: string;
  title: string;
  snippet: string;
  relevance: number;
  facets: Record<string, string | number | boolean | null>;
  payload: Record<string, unknown>;
  updatedAt: string;
};

type SearchDocSeed = {
  sourceId: string;
  title?: string | null;
  body: string;
  facets?: Record<string, string | number | boolean | null>;
  sortText?: string | null;
  sortNumber?: number | null;
  sortDate?: Date | null;
  appUserId?: string | null;
  payload?: Record<string, unknown>;
};

const BUILTIN_INDEXES: Array<{
  key: string;
  name: string;
  sourceKey: ServiceSearchBuiltinEntity;
  titleFields: string[];
  bodyFields: string[];
  facetFields: string[];
  sortField?: string;
  visibility: ServiceSearchVisibility;
  scopeMode: ServiceSearchScope;
}> = [
  {
    key: "page:comments",
    name: "Comments",
    sourceKey: "comments",
    titleFields: [],
    bodyFields: ["content"],
    facetFields: ["nodeId"],
    sortField: "updated_at",
    visibility: "public",
    scopeMode: "all",
  },
  {
    key: "page:chat",
    name: "Chat",
    sourceKey: "chat",
    titleFields: [],
    bodyFields: ["content"],
    facetFields: [],
    sortField: "created_at",
    visibility: "public",
    scopeMode: "all",
  },
  {
    key: "page:todos",
    name: "Todos",
    sourceKey: "todos",
    titleFields: ["title"],
    bodyFields: ["title"],
    facetFields: ["done"],
    sortField: "updated_at",
    visibility: "public",
    scopeMode: "all",
  },
  {
    key: "page:notes",
    name: "Notes",
    sourceKey: "notes",
    titleFields: [],
    bodyFields: ["content"],
    facetFields: [],
    sortField: "updated_at",
    visibility: "public",
    scopeMode: "all",
  },
  {
    key: "page:calendar",
    name: "Calendar",
    sourceKey: "calendar",
    titleFields: ["title"],
    bodyFields: ["title"],
    facetFields: ["startAt"],
    sortField: "start_at",
    visibility: "public",
    scopeMode: "all",
  },
];

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value as number), min), max);
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function normalizeVisibility(value: unknown): ServiceSearchVisibility {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "public" || raw === "app_user" || raw === "owner") {
    return raw;
  }
  return "owner";
}

function normalizeScope(value: unknown): ServiceSearchScope {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "own") return "own";
  return "all";
}

function normalizeFacetValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function normalizeDocPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeDocFacets(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(input).map(([key, facetValue]) => [key, normalizeFacetValue(facetValue)]),
  ) as Record<string, string | number | boolean | null>;
}

function indexEnabled(index: {
  enabled: boolean;
  source_type: string;
  source_key: string;
}, env: AppEnv) {
  if (!index.enabled) return false;
  if (index.source_type !== "app_collection") return true;
  return env === "dev" ? isDevSlug(index.source_key) : !isDevSlug(index.source_key);
}

function canAccessIndex(
  index: {
    visibility: string;
    scope_mode: string;
  },
  access: ServiceSearchAccess,
) {
  if (access.isOwner) return true;
  const visibility = normalizeVisibility(index.visibility);
  if (visibility === "public") return true;
  if (visibility === "app_user" && access.appUserId) return true;
  return false;
}

function canAccessDocument(
  index: { scope_mode: string },
  doc: { app_user_id: string | null },
  access: ServiceSearchAccess,
) {
  if (access.isOwner) return true;
  if (normalizeScope(index.scope_mode) !== "own") return true;
  return Boolean(access.appUserId && doc.app_user_id === access.appUserId);
}

function containsCaseInsensitive(value: string | null | undefined, q: string) {
  if (!value) return false;
  return value.toLowerCase().includes(q.toLowerCase());
}

function tokenizeQuery(q: string) {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function computeSearchScore(title: string | null | undefined, body: string | null | undefined, q: string) {
  const titleLower = (title ?? "").toLowerCase();
  const bodyLower = (body ?? "").toLowerCase();
  const tokens = tokenizeQuery(q);
  if (!tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    if (titleLower === token) score += 12;
    if (titleLower.startsWith(token)) score += 8;
    if (titleLower.includes(token)) score += 5;
    if (bodyLower.startsWith(token)) score += 3;
    if (bodyLower.includes(token)) score += 2;
  }
  return score;
}

function buildSnippet(text: string | null | undefined, q: string) {
  const source = (text ?? "").trim();
  if (!source) return "";
  const lower = source.toLowerCase();
  const tokens = tokenizeQuery(q);
  const first = tokens.find((token) => lower.includes(token));
  if (!first) return source.slice(0, 220);
  const idx = lower.indexOf(first);
  const start = Math.max(0, idx - 60);
  return source.slice(start, start + 220);
}

function preferredTitleFields(fields: AppFieldDef[]) {
  const names = fields.filter((field) => field.type === "string").map((field) => field.name);
  const priorities = ["title", "name", "subject", "label", "headline"];
  const picked = priorities.find((field) => names.includes(field));
  return picked ? [picked] : names.slice(0, 1);
}

function preferredBodyFields(fields: AppFieldDef[], titleFields: string[]) {
  const names = fields.filter((field) => field.type === "string").map((field) => field.name);
  const body = names.filter((field) => !titleFields.includes(field));
  return body.length ? body : titleFields;
}

function preferredFacetFields(fields: AppFieldDef[]) {
  return fields
    .filter((field) => field.type === "boolean" || field.type === "number" || field.type === "date")
    .map((field) => field.name)
    .slice(0, 8);
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

function sortValueForField(record: Record<string, unknown>, field: string | null | undefined) {
  if (!field) return { sortText: null, sortNumber: null, sortDate: null };
  const value = record[field];
  if (typeof value === "number") {
    return { sortText: null, sortNumber: value, sortDate: null };
  }
  if (typeof value === "string") {
    const date = Date.parse(value);
    if (Number.isFinite(date)) {
      return { sortText: value, sortNumber: null, sortDate: new Date(date) };
    }
    return { sortText: value, sortNumber: null, sortDate: null };
  }
  if (value instanceof Date) {
    return { sortText: value.toISOString(), sortNumber: null, sortDate: value };
  }
  if (typeof value === "boolean") {
    return { sortText: String(value), sortNumber: value ? 1 : 0, sortDate: null };
  }
  return { sortText: null, sortNumber: null, sortDate: null };
}

function serviceSearchIndexKeyForCollection(slug: string) {
  return `collection:${slug}`;
}

export async function listServiceSearchIndices(pageId: string) {
  return prisma.serviceSearchIndex.findMany({
    where: { page_id: pageId },
    orderBy: [{ source_type: "asc" }, { source_key: "asc" }],
  });
}

export async function ensureDefaultServiceSearchIndices(pageId: string) {
  const collections = await prisma.appCollection.findMany({
    where: { page_id: pageId },
    orderBy: { slug: "asc" },
  });

  for (const builtin of BUILTIN_INDEXES) {
    await prisma.serviceSearchIndex.upsert({
      where: { page_id_key: { page_id: pageId, key: builtin.key } },
      update: {
        name: builtin.name,
        source_type: "page_entity",
        source_key: builtin.sourceKey,
        title_fields: builtin.titleFields,
        body_fields: builtin.bodyFields,
        facet_fields: builtin.facetFields,
        sort_field: builtin.sortField ?? null,
        visibility: builtin.visibility,
        scope_mode: builtin.scopeMode,
        enabled: true,
      },
      create: {
        page_id: pageId,
        key: builtin.key,
        name: builtin.name,
        source_type: "page_entity",
        source_key: builtin.sourceKey,
        title_fields: builtin.titleFields,
        body_fields: builtin.bodyFields,
        facet_fields: builtin.facetFields,
        sort_field: builtin.sortField ?? null,
        visibility: builtin.visibility,
        scope_mode: builtin.scopeMode,
        enabled: true,
      },
    });
  }

  for (const collection of collections) {
    const fields = Array.isArray(collection.fields) ? (collection.fields as unknown as AppFieldDef[]) : [];
    const titleFields = preferredTitleFields(fields);
    const bodyFields = preferredBodyFields(fields, titleFields);
    const facetFields = preferredFacetFields(fields);
    const hasAppUserField = fields.some((field) => field.name === "app_user_id");
    const visibility: ServiceSearchVisibility = hasAppUserField ? "app_user" : "owner";
    const scopeMode: ServiceSearchScope = hasAppUserField ? "own" : "all";
    await prisma.serviceSearchIndex.upsert({
      where: { page_id_key: { page_id: pageId, key: serviceSearchIndexKeyForCollection(collection.slug) } },
      update: {
        name: collection.name,
        source_type: "app_collection",
        source_key: collection.slug,
        title_fields: titleFields,
        body_fields: bodyFields,
        facet_fields: facetFields,
        sort_field: "updated_at",
        visibility,
        scope_mode: scopeMode,
        enabled: true,
      },
      create: {
        page_id: pageId,
        key: serviceSearchIndexKeyForCollection(collection.slug),
        name: collection.name,
        source_type: "app_collection",
        source_key: collection.slug,
        title_fields: titleFields,
        body_fields: bodyFields,
        facet_fields: facetFields,
        sort_field: "updated_at",
        visibility,
        scope_mode: scopeMode,
        enabled: true,
      },
    });
  }
}

async function buildBuiltinDocuments(
  pageId: string,
  sourceKey: ServiceSearchBuiltinEntity,
): Promise<SearchDocSeed[]> {
  if (sourceKey === "comments") {
    const rows = await prisma.comment.findMany({
      where: { page_id: pageId },
      orderBy: { updated_at: "desc" },
      select: { id: true, content: true, node_id: true, created_at: true, updated_at: true },
    });
    return rows.map((row) => ({
      sourceId: row.id,
      body: row.content,
      facets: { nodeId: row.node_id },
      sortDate: row.updated_at,
      payload: {
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        nodeId: row.node_id,
      },
    }));
  }
  if (sourceKey === "chat") {
    const rows = await prisma.chatMessage.findMany({
      where: { page_id: pageId },
      orderBy: { created_at: "desc" },
      select: { id: true, content: true, created_at: true },
    });
    return rows.map((row) => ({
      sourceId: row.id,
      body: row.content,
      sortDate: row.created_at,
      payload: { createdAt: row.created_at.toISOString() },
    }));
  }
  if (sourceKey === "todos") {
    const rows = await prisma.todo.findMany({
      where: { page_id: pageId },
      orderBy: { updated_at: "desc" },
      select: { id: true, title: true, done: true, created_at: true, updated_at: true },
    });
    return rows.map((row) => ({
      sourceId: row.id,
      title: row.title,
      body: row.title,
      facets: { done: row.done },
      sortDate: row.updated_at,
      sortText: row.title,
      sortNumber: row.done ? 1 : 0,
      payload: {
        done: row.done,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    }));
  }
  if (sourceKey === "notes") {
    const note = await prisma.note.findUnique({
      where: { page_id: pageId },
      select: { id: true, content: true, updated_at: true },
    });
    if (!note) return [];
    return [
      {
        sourceId: note.id,
        body: note.content,
        sortDate: note.updated_at,
        payload: { updatedAt: note.updated_at.toISOString() },
      },
    ];
  }
  const rows = await prisma.calendarEvent.findMany({
    where: { page_id: pageId },
    orderBy: { start_at: "desc" },
    select: { id: true, title: true, start_at: true, end_at: true, created_at: true },
  });
  return rows.map((row) => ({
    sourceId: row.id,
    title: row.title,
    body: row.title,
    facets: { startAt: row.start_at.toISOString() },
    sortDate: row.start_at,
    sortText: row.title,
    payload: {
      startAt: row.start_at.toISOString(),
      endAt: row.end_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    },
  }));
}

async function buildCollectionDocuments(
  pageId: string,
  index: {
    source_key: string;
    title_fields: unknown;
    body_fields: unknown;
    facet_fields: unknown;
    sort_field: string | null;
  },
  options?: { recordIds?: string[] },
): Promise<SearchDocSeed[]> {
  const records = await prisma.appRecord.findMany({
    where: {
      page_id: pageId,
      collection_slug: index.source_key,
      ...(options?.recordIds?.length ? { id: { in: options.recordIds } } : {}),
    },
    orderBy: { updated_at: "desc" },
    select: { id: true, data: true, updated_at: true, created_at: true, app_user_id: true },
  });
  const titleFields = toStringArray(index.title_fields);
  const bodyFields = toStringArray(index.body_fields);
  const facetFields = toStringArray(index.facet_fields);
  return records.map((record) => {
    const data = normalizeDocPayload(record.data);
    const titleParts = toTextParts(data, titleFields);
    const bodyParts = toTextParts(data, bodyFields);
    const sortValue = sortValueForField(
      { ...data, updated_at: record.updated_at.toISOString(), created_at: record.created_at.toISOString() },
      index.sort_field,
    );
    return {
      sourceId: record.id,
      title: titleParts.join(" ").trim() || null,
      body: bodyParts.join(" ").trim() || titleParts.join(" ").trim() || record.id,
      facets: toFacets(data, facetFields),
      sortText: sortValue.sortText,
      sortNumber: sortValue.sortNumber,
      sortDate: sortValue.sortDate ?? record.updated_at,
      appUserId: record.app_user_id,
      payload: {
        collectionSlug: index.source_key,
        createdAt: record.created_at.toISOString(),
        updatedAt: record.updated_at.toISOString(),
      },
    };
  });
}

async function buildDocumentsForIndex(
  pageId: string,
  index: {
    id: string;
    source_type: string;
    source_key: string;
    title_fields: unknown;
    body_fields: unknown;
    facet_fields: unknown;
    sort_field: string | null;
  },
  options?: { recordIds?: string[] },
) {
  if (index.source_type === "page_entity") {
    return buildBuiltinDocuments(pageId, index.source_key as ServiceSearchBuiltinEntity);
  }
  return buildCollectionDocuments(pageId, index, options);
}

async function replaceDocumentsForIndex(
  pageId: string,
  index: {
    id: string;
    source_type: string;
    source_key: string;
  },
  docs: SearchDocSeed[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.serviceSearchDocument.deleteMany({ where: { page_id: pageId, index_id: index.id } });
    if (!docs.length) return;
    await tx.serviceSearchDocument.createMany({
      data: docs.map((doc) => ({
        page_id: pageId,
        index_id: index.id,
        source_type: index.source_type,
        source_key: index.source_key,
        source_id: doc.sourceId,
        title: doc.title ?? null,
        body: doc.body,
        facets: (doc.facets ?? {}) as Prisma.InputJsonValue,
        sort_text: doc.sortText ?? null,
        sort_number: doc.sortNumber ?? null,
        sort_date: doc.sortDate ?? null,
        app_user_id: doc.appUserId ?? null,
        payload: (doc.payload ?? {}) as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  });
}

async function upsertDocumentsForIndex(
  pageId: string,
  index: {
    id: string;
    source_type: string;
    source_key: string;
  },
  docs: SearchDocSeed[],
) {
  for (const doc of docs) {
    await prisma.serviceSearchDocument.upsert({
      where: { index_id_source_id: { index_id: index.id, source_id: doc.sourceId } },
      update: {
        title: doc.title ?? null,
        body: doc.body,
        facets: (doc.facets ?? {}) as Prisma.InputJsonValue,
        sort_text: doc.sortText ?? null,
        sort_number: doc.sortNumber ?? null,
        sort_date: doc.sortDate ?? null,
        app_user_id: doc.appUserId ?? null,
        payload: (doc.payload ?? {}) as Prisma.InputJsonValue,
      },
      create: {
        page_id: pageId,
        index_id: index.id,
        source_type: index.source_type,
        source_key: index.source_key,
        source_id: doc.sourceId,
        title: doc.title ?? null,
        body: doc.body,
        facets: (doc.facets ?? {}) as Prisma.InputJsonValue,
        sort_text: doc.sortText ?? null,
        sort_number: doc.sortNumber ?? null,
        sort_date: doc.sortDate ?? null,
        app_user_id: doc.appUserId ?? null,
        payload: (doc.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

export async function reindexServiceSearchIndices(input: {
  pageId: string;
  indexKeys?: string[];
  env?: AppEnv;
  actor?: AppAuditActor;
}) {
  await ensureDefaultServiceSearchIndices(input.pageId);
  const env = input.env ?? "prod";
  const indices = await prisma.serviceSearchIndex.findMany({
    where: {
      page_id: input.pageId,
      ...(input.indexKeys?.length ? { key: { in: input.indexKeys } } : {}),
    },
    orderBy: { key: "asc" },
  });
  const target = indices.filter((index) => indexEnabled(index, env));
  let docCount = 0;
  for (const index of target) {
    const docs = await buildDocumentsForIndex(input.pageId, index);
    await replaceDocumentsForIndex(input.pageId, index, docs);
    docCount += docs.length;
  }
  if (target.length) {
    await logAppAudit({
      pageId: input.pageId,
      action: "service_search_reindex",
      targetType: "service_search",
      targetId: target.map((index) => index.key).join(","),
      actor: input.actor,
      meta: { indexKeys: target.map((index) => index.key), env, documents: docCount },
    });
  }
  return { indexes: target.length, documents: docCount };
}

export async function syncServiceSearchRecord(input: {
  pageId: string;
  collectionSlug: string;
  recordId: string;
}) {
  const indexes = await prisma.serviceSearchIndex.findMany({
    where: {
      page_id: input.pageId,
      source_type: "app_collection",
      source_key: input.collectionSlug,
      enabled: true,
    },
  });
  for (const index of indexes) {
    const docs = await buildCollectionDocuments(input.pageId, index, { recordIds: [input.recordId] });
    if (!docs.length) {
      await prisma.serviceSearchDocument.deleteMany({
        where: {
          page_id: input.pageId,
          index_id: index.id,
          source_id: input.recordId,
        },
      });
      continue;
    }
    await upsertDocumentsForIndex(input.pageId, index, docs);
  }
}

export async function deleteServiceSearchRecord(input: {
  pageId: string;
  collectionSlug: string;
  recordId: string;
}) {
  await prisma.serviceSearchDocument.deleteMany({
    where: {
      page_id: input.pageId,
      source_type: "app_collection",
      source_key: input.collectionSlug,
      source_id: input.recordId,
    },
  });
}

export async function ensureServiceSearchReady(pageId: string, env: AppEnv = "prod") {
  await ensureDefaultServiceSearchIndices(pageId);
  const indexes = await prisma.serviceSearchIndex.findMany({ where: { page_id: pageId, enabled: true } });
  for (const index of indexes) {
    if (!indexEnabled(index, env)) continue;
    const existing = await prisma.serviceSearchDocument.count({ where: { page_id: pageId, index_id: index.id } });
    if (existing > 0) continue;
    const docs = await buildDocumentsForIndex(pageId, index);
    await replaceDocumentsForIndex(pageId, index, docs);
  }
}

export async function scheduleServiceSearchReindex(input: {
  pageId: string;
  indexKeys?: string[];
  env?: AppEnv;
}) {
  await enqueueJob({
    pageId: input.pageId,
    queue: "search",
    type: "service-search-reindex",
    payload: {
      indexKeys: input.indexKeys ?? null,
      env: input.env ?? "prod",
    },
    priority: 75,
    dedupeKey: `service-search-reindex:${input.pageId}:${input.env ?? "prod"}:${(input.indexKeys ?? []).slice().sort().join(",")}`,
    maxAttempts: 2,
  });
}

type PersistedIndex = Awaited<ReturnType<typeof listServiceSearchIndices>>[number];
type PersistedDoc = {
  id: string;
  page_id: string;
  index_id: string;
  source_type: string;
  source_key: string;
  source_id: string;
  title: string | null;
  body: string;
  facets: Prisma.JsonValue | null;
  sort_text: string | null;
  sort_number: number | null;
  sort_date: Date | null;
  app_user_id: string | null;
  payload: Prisma.JsonValue | null;
  updated_at: Date;
};

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

export async function queryServiceSearch(
  pageId: string,
  input: ServiceSearchQueryInput,
  access: ServiceSearchAccess,
) {
  const q = String(input.q ?? "").trim();
  if (!q) return { items: [] as ServiceSearchDocumentResult[], total: 0, limit: 0, offset: 0 };

  const limit = clamp(input.limit, 20, 1, 100);
  const offset = clamp(input.offset, 0, 0, 10_000);
  const env = input.env ?? access.env ?? "prod";

  await ensureServiceSearchReady(pageId, env);
  const allIndices = await prisma.serviceSearchIndex.findMany({
    where: {
      page_id: pageId,
      enabled: true,
      ...(input.indexKeys?.length ? { key: { in: input.indexKeys } } : {}),
      ...(input.sourceType ? { source_type: input.sourceType } : {}),
    },
    orderBy: { key: "asc" },
  });

  const indices = allIndices.filter((index) => indexEnabled(index, env) && canAccessIndex(index, access));
  if (!indices.length) {
    return { items: [] as ServiceSearchDocumentResult[], total: 0, limit, offset };
  }

  const docs = (await prisma.serviceSearchDocument.findMany({
    where: {
      page_id: pageId,
      index_id: { in: indices.map((index) => index.id) },
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updated_at: "desc" },
    take: 500,
  })) as PersistedDoc[];

  const indexMap = new Map(indices.map((index) => [index.id, index]));
  const filters = input.filters ?? {};
  const scored = docs
    .map((doc) => {
      const index = indexMap.get(doc.index_id) as PersistedIndex | undefined;
      if (!index) return null;
      if (!canAccessDocument(index, doc, access)) return null;
      const facets = normalizeDocFacets(doc.facets);
      if (!matchesFacetFilters(facets, filters)) return null;
      const relevance = computeSearchScore(doc.title, doc.body, q);
      if (relevance <= 0 && !containsCaseInsensitive(doc.title, q) && !containsCaseInsensitive(doc.body, q)) return null;
      return {
        doc,
        index,
        facets,
        relevance,
      };
    })
    .filter((row): row is { doc: PersistedDoc; index: PersistedIndex; facets: Record<string, string | number | boolean | null>; relevance: number } => Boolean(row));

  const orderBy = input.orderBy ?? "relevance";
  const direction = input.orderDir === "asc" ? 1 : -1;
  scored.sort((a, b) => {
    if (orderBy === "sort_date") {
      const left = a.doc.sort_date?.getTime() ?? 0;
      const right = b.doc.sort_date?.getTime() ?? 0;
      return (left - right) * direction || (b.relevance - a.relevance);
    }
    if (orderBy === "sort_number") {
      const left = a.doc.sort_number ?? 0;
      const right = b.doc.sort_number ?? 0;
      return (left - right) * direction || (b.relevance - a.relevance);
    }
    if (orderBy === "sort_text") {
      return (a.doc.sort_text ?? "").localeCompare(b.doc.sort_text ?? "") * direction || (b.relevance - a.relevance);
    }
    if (orderBy === "updated_at") {
      return (a.doc.updated_at.getTime() - b.doc.updated_at.getTime()) * direction || (b.relevance - a.relevance);
    }
    return (b.relevance - a.relevance) * direction || (b.doc.updated_at.getTime() - a.doc.updated_at.getTime());
  });

  const sliced = scored.slice(offset, offset + limit);
  const result = {
    total: scored.length,
    limit,
    offset,
    items: sliced.map(({ doc, index, facets, relevance }) => ({
      id: doc.id,
      indexKey: index.key,
      indexName: index.name,
      sourceType: index.source_type as ServiceSearchSourceType,
      sourceKey: index.source_key,
      sourceId: doc.source_id,
      title: doc.title ?? index.name,
      snippet: buildSnippet(doc.body, q),
      relevance,
      facets,
      payload: normalizeDocPayload(doc.payload),
        updatedAt: doc.updated_at.toISOString(),
    })),
  };
  return applyServiceSearchRuntimeExtensions(pageId, result, {
    pageId,
    query: q,
    indexKeys: indices.map((index) => index.key),
    filters,
    access,
    orderBy,
    orderDir: input.orderDir ?? "desc",
  });
}

export async function upsertServiceSearchIndex(input: {
  pageId: string;
  key: string;
  name: string;
  sourceType: ServiceSearchSourceType;
  sourceKey: string;
  titleFields?: string[];
  bodyFields?: string[];
  facetFields?: string[];
  sortField?: string | null;
  visibility?: ServiceSearchVisibility;
  scopeMode?: ServiceSearchScope;
  enabled?: boolean;
  config?: Record<string, unknown>;
  actor?: AppAuditActor;
}) {
  const index = await prisma.serviceSearchIndex.upsert({
    where: { page_id_key: { page_id: input.pageId, key: input.key } },
    update: {
      name: input.name,
      source_type: input.sourceType,
      source_key: input.sourceKey,
      title_fields: input.titleFields ?? [],
      body_fields: input.bodyFields ?? [],
      facet_fields: input.facetFields ?? [],
      sort_field: input.sortField ?? null,
      visibility: input.visibility ?? "owner",
      scope_mode: input.scopeMode ?? "all",
      enabled: input.enabled ?? true,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
    },
    create: {
      page_id: input.pageId,
      key: input.key,
      name: input.name,
      source_type: input.sourceType,
      source_key: input.sourceKey,
      title_fields: input.titleFields ?? [],
      body_fields: input.bodyFields ?? [],
      facet_fields: input.facetFields ?? [],
      sort_field: input.sortField ?? null,
      visibility: input.visibility ?? "owner",
      scope_mode: input.scopeMode ?? "all",
      enabled: input.enabled ?? true,
      config: (input.config ?? {}) as Prisma.InputJsonValue,
    },
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_search_index_upsert",
    targetType: "service_search_index",
    targetId: index.id,
    actor: input.actor,
    meta: { key: index.key, sourceType: index.source_type, sourceKey: index.source_key },
  });
  return index;
}

registerBackgroundJobHandler("service-search-reindex", async (job) => {
  if (!job.pageId) {
    return {
      ok: false,
      kind: "background_job",
      error: "service_search_reindex_missing_page",
      errorCode: "service_search_reindex_missing_page",
      logs: [],
    };
  }
  const payload = normalizeDocPayload(job.payload);
  const rawIndexKeys = Array.isArray(payload.indexKeys) ? payload.indexKeys.map((value) => String(value)).filter(Boolean) : [];
  const env = payload.env === "dev" ? "dev" : "prod";
  const result = await reindexServiceSearchIndices({
    pageId: job.pageId,
    indexKeys: rawIndexKeys,
    env,
  });
  return {
    ok: true,
    kind: "background_job",
    data: result,
    logs: [`service_search_reindex:${result.indexes}:${result.documents}`],
  };
});
