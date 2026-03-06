/**
 * App data: per-page collections and records.
 */

import { prisma } from "@/lib/db";
import {
  buildListCacheKey,
  buildRecordCacheKey,
  bumpCollectionCacheVersion,
  getCachedValue,
  getCollectionCacheVersion,
  setCachedValue,
} from "@/lib/app-data-cache";

export type AppFieldType = "string" | "number" | "boolean" | "date" | "json" | "relation";

export type AppFieldDef = {
  name: string;
  type: AppFieldType;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: Array<string | number | boolean>;
};

export type AppCollectionDef = {
  slug: string;
  name: string;
  fields: AppFieldDef[];
  strict?: boolean;
};

export type SchemaMode = "preserve" | "prune";

export type AppSchemaMigrations = {
  renameFields?: Record<string, Record<string, string>>;
  deleteFields?: Record<string, string[]>;
  defaults?: Record<string, Record<string, unknown>>;
};

export type SetSchemaOptions = {
  mode?: SchemaMode;
  migrations?: AppSchemaMigrations;
  batchSize?: number;
};

export type AppRecordActor = {
  userId?: string;
  appUserId?: string;
  anonId?: string;
};

export type FieldValidationError = {
  field: string;
  code: string;
  message: string;
  value?: unknown;
};

type ValidateOptions = {
  mode: "create" | "update";
  strict?: boolean;
};

function normalizeEnumValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return value;
}

function isEmptyValue(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function normalizeValue(def: AppFieldDef, raw: unknown): { value?: unknown; error?: FieldValidationError } {
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: null };

  switch (def.type) {
    case "string": {
      if (typeof raw !== "string") {
        return { error: { field: def.name, code: "type", message: "string_required", value: raw } };
      }
      if (typeof def.minLength === "number" && raw.length < def.minLength) {
        return { error: { field: def.name, code: "min_length", message: "min_length", value: raw } };
      }
      if (typeof def.maxLength === "number" && raw.length > def.maxLength) {
        return { error: { field: def.name, code: "max_length", message: "max_length", value: raw } };
      }
      if (def.pattern) {
        try {
          const re = new RegExp(def.pattern);
          if (!re.test(raw)) {
            return { error: { field: def.name, code: "pattern", message: "pattern_mismatch", value: raw } };
          }
        } catch (err) {
          return {
            error: { field: def.name, code: "pattern_invalid", message: "invalid_pattern", value: def.pattern },
          };
        }
      }
      if (Array.isArray(def.enum)) {
        const normalized = normalizeEnumValue(raw);
        if (!def.enum.includes(normalized as string | number | boolean)) {
          return { error: { field: def.name, code: "enum", message: "enum_mismatch", value: raw } };
        }
      }
      return { value: raw };
    }
    case "number": {
      let num = raw;
      if (typeof raw === "string" && raw.trim() !== "") {
        const parsed = Number(raw);
        num = Number.isFinite(parsed) ? parsed : raw;
      }
      if (typeof num !== "number" || Number.isNaN(num)) {
        return { error: { field: def.name, code: "type", message: "number_required", value: raw } };
      }
      if (typeof def.min === "number" && num < def.min) {
        return { error: { field: def.name, code: "min", message: "min", value: num } };
      }
      if (typeof def.max === "number" && num > def.max) {
        return { error: { field: def.name, code: "max", message: "max", value: num } };
      }
      if (Array.isArray(def.enum)) {
        if (!def.enum.includes(num)) {
          return { error: { field: def.name, code: "enum", message: "enum_mismatch", value: num } };
        }
      }
      return { value: num };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { value: raw };
      if (typeof raw === "string") {
        if (raw === "true") return { value: true };
        if (raw === "false") return { value: false };
      }
      if (typeof raw === "number") {
        if (raw === 1) return { value: true };
        if (raw === 0) return { value: false };
      }
      return { error: { field: def.name, code: "type", message: "boolean_required", value: raw } };
    }
    case "date": {
      let ts: number | null = null;
      if (raw instanceof Date) ts = raw.getTime();
      if (typeof raw === "string") ts = Date.parse(raw);
      if (typeof raw === "number") ts = raw;
      if (!ts || Number.isNaN(ts)) {
        return { error: { field: def.name, code: "type", message: "date_required", value: raw } };
      }
      return { value: new Date(ts).toISOString() };
    }
    case "relation": {
      if (typeof raw === "string") return { value: raw };
      if (Array.isArray(raw) && raw.every((v) => typeof v === "string")) return { value: raw };
      return { error: { field: def.name, code: "type", message: "relation_required", value: raw } };
    }
    case "json":
    default:
      return { value: raw };
  }
}

export function validateRecordData(
  fields: AppFieldDef[],
  input: Record<string, unknown>,
  options: ValidateOptions
) {
  const errors: FieldValidationError[] = [];
  const output: Record<string, unknown> = options.strict ? {} : { ...input };
  const fieldMap = new Map(fields.map((f) => [f.name, f]));

  for (const def of fields) {
    const hasValue = Object.prototype.hasOwnProperty.call(input, def.name);
    let raw = hasValue ? input[def.name] : undefined;
    if (!hasValue && options.mode === "create" && def.default !== undefined) {
      raw = def.default;
    }

    if (isEmptyValue(raw)) {
      if (def.required) {
        errors.push({ field: def.name, code: "required", message: "required", value: raw });
      } else if (raw !== undefined) {
        output[def.name] = raw;
      }
      continue;
    }

    const normalized = normalizeValue(def, raw);
    if (normalized.error) {
      errors.push(normalized.error);
      continue;
    }
    if (normalized.value !== undefined) output[def.name] = normalized.value;
  }

  if (options.strict) {
    for (const key of Object.keys(input)) {
      if (!fieldMap.has(key)) {
        errors.push({ field: key, code: "unknown_field", message: "unknown_field", value: input[key] });
      }
    }
  }

  return { data: output, errors };
}

export async function getCollections(pageId: string) {
  const list = await prisma.appCollection.findMany({
    where: { page_id: pageId },
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, name: true, strict: true, fields: true, created_at: true, updated_at: true },
  });
  return list.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    strict: c.strict ?? false,
    fields: c.fields as AppFieldDef[],
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));
}

async function applyFieldMigrations(
  pageId: string,
  collectionSlug: string,
  migrations: AppSchemaMigrations,
  batchSize = 200
) {
  const renameMap = migrations.renameFields?.[collectionSlug] ?? {};
  const deleteList = migrations.deleteFields?.[collectionSlug] ?? [];
  const defaults = migrations.defaults?.[collectionSlug] ?? {};

  const hasWork =
    Object.keys(renameMap).length > 0 ||
    deleteList.length > 0 ||
    Object.keys(defaults).length > 0;
  if (!hasWork) return { scanned: 0, updated: 0 };

  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const records = await prisma.appRecord.findMany({
      where: { page_id: pageId, collection_slug: collectionSlug },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, data: true },
    });
    if (!records.length) break;

    for (const record of records) {
      scanned += 1;
      const current = (record.data ?? {}) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...current };
      let changed = false;

      for (const [from, to] of Object.entries(renameMap)) {
        if (from in next) {
          if (!(to in next)) {
            next[to] = next[from];
          }
          delete next[from];
          changed = true;
        }
      }

      for (const field of deleteList) {
        if (field in next) {
          delete next[field];
          changed = true;
        }
      }

      for (const [field, value] of Object.entries(defaults)) {
        if (!(field in next)) {
          next[field] = value;
          changed = true;
        }
      }

      if (changed) {
        await prisma.appRecord.update({
          where: { id: record.id },
          data: { data: next as object, updated_at: new Date() },
        });
        updated += 1;
      }
    }

    cursor = records[records.length - 1]?.id;
  }

  return { scanned, updated };
}

export async function setSchema(
  pageId: string,
  collections: AppCollectionDef[],
  options: SetSchemaOptions = {}
) {
  const mode: SchemaMode = options.mode ?? "preserve";
  const batchSize = Math.min(Math.max(options.batchSize ?? 200, 20), 1000);
  const normalized = collections.filter((c) => c && c.slug && c.name);
  const slugs = normalized.map((c) => c.slug);

  await prisma.$transaction(async (tx) => {
    for (const c of normalized) {
      await tx.appCollection.upsert({
        where: { page_id_slug: { page_id: pageId, slug: c.slug } },
        update: {
          name: c.name,
          strict: Boolean(c.strict),
          fields: (c.fields ?? []) as object,
          updated_at: new Date(),
        },
        create: {
          page_id: pageId,
          slug: c.slug,
          name: c.name,
          strict: Boolean(c.strict),
          fields: (c.fields ?? []) as object,
        },
      });
    }

    if (mode === "prune") {
      await tx.appRecord.deleteMany({
        where: { page_id: pageId, collection_slug: { notIn: slugs.length ? slugs : ["__none__"] } },
      });
      await tx.appCollection.deleteMany({
        where: { page_id: pageId, slug: { notIn: slugs.length ? slugs : ["__none__"] } },
      });
    }
  });

  if (options.migrations) {
    const targets = new Set<string>();
    Object.keys(options.migrations.renameFields ?? {}).forEach((slug) => targets.add(slug));
    Object.keys(options.migrations.deleteFields ?? {}).forEach((slug) => targets.add(slug));
    Object.keys(options.migrations.defaults ?? {}).forEach((slug) => targets.add(slug));
    for (const slug of targets) {
      await applyFieldMigrations(pageId, slug, options.migrations, batchSize);
    }
  }

  for (const slug of slugs) {
    await bumpCollectionCacheVersion(pageId, slug);
  }
}

export async function getCollectionBySlug(pageId: string, slug: string) {
  return prisma.appCollection.findUnique({
    where: { page_id_slug: { page_id: pageId, slug } },
  });
}

export async function listRecords(
  pageId: string,
  collectionSlug: string,
  options?: {
    limit?: number;
    offset?: number;
    orderBy?: "created_at" | "updated_at";
    orderDir?: "asc" | "desc";
    appUserId?: string | null;
  }
) {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const offset = Math.max(options?.offset ?? 0, 0);
  const orderBy = options?.orderBy ?? "created_at";
  const orderDir = options?.orderDir ?? "desc";
  const where: { page_id: string; collection_slug: string; app_user_id?: string } = {
    page_id: pageId,
    collection_slug: collectionSlug,
  };
  if (options?.appUserId) where.app_user_id = options.appUserId;

  const version = await getCollectionCacheVersion(pageId, collectionSlug);
  const cacheKey = buildListCacheKey(
    pageId,
    collectionSlug,
    version,
    limit,
    offset,
    orderBy,
    orderDir,
    options?.appUserId ?? null,
  );
  const cached = await getCachedValue<unknown>(cacheKey);
  if (cached) return cached as { items: unknown[]; total: number; limit: number; offset: number };

  const [items, total] = await Promise.all([
    prisma.appRecord.findMany({
      where,
      orderBy: { [orderBy]: orderDir },
      take: limit,
      skip: offset,
      select: { id: true, data: true, created_at: true, updated_at: true, app_user_id: true },
    }),
    prisma.appRecord.count({ where }),
  ]);

  const result = { items, total, limit, offset };
  await setCachedValue(cacheKey, result);
  return result;
}

export async function getRecord(pageId: string, collectionSlug: string, id: string, options?: { appUserId?: string | null }) {
  const where: { id: string; page_id: string; collection_slug: string; app_user_id?: string } = {
    id,
    page_id: pageId,
    collection_slug: collectionSlug,
  };
  if (options?.appUserId) where.app_user_id = options.appUserId;
  const version = await getCollectionCacheVersion(pageId, collectionSlug);
  const cacheKey = buildRecordCacheKey(pageId, collectionSlug, version, id, options?.appUserId ?? null);
  const cached = await getCachedValue<unknown>(cacheKey);
  if (cached) return cached as Awaited<ReturnType<typeof prisma.appRecord.findFirst>>;
  const record = await prisma.appRecord.findFirst({ where });
  if (record) await setCachedValue(cacheKey, record);
  return record;
}

async function logRecordVersion(
  pageId: string,
  collectionSlug: string,
  recordId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  actor?: AppRecordActor,
) {
  await prisma.appRecordVersion.create({
    data: {
      page_id: pageId,
      record_id: recordId,
      collection_slug: collectionSlug,
      action,
      data: data as object,
      actor_user_id: actor?.userId ?? null,
      actor_app_user_id: actor?.appUserId ?? null,
      actor_anon_id: actor?.anonId ?? null,
    },
  });
}

export async function createRecord(
  pageId: string,
  collectionSlug: string,
  data: Record<string, unknown>,
  actor?: AppRecordActor,
  options?: { appUserId?: string | null }
) {
  const record = await prisma.appRecord.create({
    data: {
      page_id: pageId,
      collection_slug: collectionSlug,
      data: data as object,
      ...(options?.appUserId !== undefined ? { app_user_id: options.appUserId } : {}),
    },
  });
  await logRecordVersion(pageId, collectionSlug, record.id, "created", record.data as Record<string, unknown>, actor);
  await bumpCollectionCacheVersion(pageId, collectionSlug);
  return record;
}

export async function updateRecord(
  pageId: string,
  collectionSlug: string,
  id: string,
  data: Partial<Record<string, unknown>>,
  options?: { replace?: boolean; appUserId?: string | null },
  actor?: AppRecordActor,
) {
  const existing = await prisma.appRecord.findFirst({
    where: { id, page_id: pageId, collection_slug: collectionSlug },
  });
  if (!existing) return null;
  const merged = options?.replace
    ? { ...(data as Record<string, unknown>) }
    : { ...(existing.data as Record<string, unknown>), ...data };
  const record = await prisma.appRecord.update({
    where: { id },
    data: {
      data: merged as object,
      updated_at: new Date(),
      ...(options?.appUserId !== undefined ? { app_user_id: options.appUserId } : {}),
    },
  });
  await logRecordVersion(pageId, collectionSlug, record.id, "updated", record.data as Record<string, unknown>, actor);
  await bumpCollectionCacheVersion(pageId, collectionSlug);
  return record;
}

export async function deleteRecord(
  pageId: string,
  collectionSlug: string,
  id: string,
  actor?: AppRecordActor,
) {
  const existing = await prisma.appRecord.findFirst({
    where: { id, page_id: pageId, collection_slug: collectionSlug },
  });
  if (!existing) return null;
  await prisma.$transaction(async (tx) => {
    await tx.appRecordVersion.create({
      data: {
        page_id: pageId,
        record_id: existing.id,
        collection_slug: collectionSlug,
        action: "deleted",
        data: existing.data as object,
        actor_user_id: actor?.userId ?? null,
        actor_app_user_id: actor?.appUserId ?? null,
        actor_anon_id: actor?.anonId ?? null,
      },
    });
    await tx.appRecord.delete({ where: { id } });
  });
  await bumpCollectionCacheVersion(pageId, collectionSlug);
  return existing;
}
