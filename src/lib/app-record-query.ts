import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getCollectionBySlug, type AppFieldDef } from "@/lib/app-data";
import { type AppEnv, toEnvSlug } from "@/lib/app-env";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { apiErrorJson } from "@/lib/api-error";
import { canAccessPublishedPage } from "@/lib/page-access";
import { parseJsonObject } from "@/lib/validation";

export type FilterOp =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "notIn"
  | "exists"
  | "notExists";

export type FilterInput = {
  field: string;
  op: FilterOp;
  value?: unknown;
};

export type QueryInput = {
  model?: string;
  filters?: FilterInput[];
  search?: { q?: string; fields?: string[] };
  orderBy?: string;
  orderDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
  aggregate?: { op: "count" | "sum" | "avg" | "min" | "max"; field?: string };
};

const ALLOWED_FIELD = /^[a-zA-Z0-9_]+$/;

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(Math.floor(num), min), max);
}

function normalizeFilter(raw: unknown): FilterInput | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const field = typeof obj.field === "string" ? obj.field.trim() : "";
  const op = typeof obj.op === "string" ? obj.op.trim() : "";
  if (!field || !ALLOWED_FIELD.test(field)) return null;
  const allowedOps: FilterOp[] = [
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "startsWith",
    "endsWith",
    "in",
    "notIn",
    "exists",
    "notExists",
  ];
  if (!allowedOps.includes(op as FilterOp)) return null;
  return { field, op: op as FilterOp, value: obj.value };
}

function coerceBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return null;
}

function coerceDate(value: unknown) {
  const ts = typeof value === "string" || value instanceof Date ? new Date(value).getTime() : Number(value);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
}

function buildFieldExpr(field: string, type: AppFieldDef["type"] | "column") {
  if (type === "column") {
    return Prisma.raw(`"${field}"`);
  }
  return Prisma.raw(`"data"->>'${field}'`);
}

function buildNumericExpr(field: string) {
  return Prisma.raw(`NULLIF("data"->>'${field}', '')::numeric`);
}

function buildDateExpr(field: string) {
  return Prisma.raw(`NULLIF("data"->>'${field}', '')::timestamptz`);
}

function buildColumnDateExpr(field: string) {
  return Prisma.raw(`"${field}"`);
}

function buildExistsExpr(field: string) {
  return Prisma.raw(`"data" ? '${field}'`);
}

function buildFilterClause(filter: FilterInput, fieldType: AppFieldDef["type"] | "column") {
  const { field, op } = filter;
  if (op === "exists") {
    if (fieldType === "column") return Prisma.sql`${buildFieldExpr(field, "column")} IS NOT NULL`;
    return Prisma.sql`${buildExistsExpr(field)}`;
  }
  if (op === "notExists") {
    if (fieldType === "column") return Prisma.sql`${buildFieldExpr(field, "column")} IS NULL`;
    return Prisma.sql`NOT ${buildExistsExpr(field)}`;
  }

  if (fieldType === "column") {
    const expr = buildFieldExpr(field, "column");
    const value = filter.value;
    if (["gt", "gte", "lt", "lte"].includes(op)) {
      const dateVal = coerceDate(value);
      if (!dateVal) return { error: "invalid_date_value" } as const;
      const dateExpr = buildColumnDateExpr(field);
      const comparator = op === "gt" ? ">" : op === "gte" ? ">=" : op === "lt" ? "<" : "<=";
      return Prisma.sql`${dateExpr} ${Prisma.raw(comparator)} ${dateVal}`;
    }
    if (op === "eq" || op === "ne") {
      const comparator = op === "eq" ? "=" : "<>";
      return Prisma.sql`${expr} ${Prisma.raw(comparator)} ${String(value ?? "")}`;
    }
    if (op === "in" || op === "notIn") {
      const list = Array.isArray(value) ? value : [];
      const items = list.map((v) => Prisma.sql`${String(v)}`);
      if (!items.length) return { error: "empty_in_list" } as const;
      const inSql = Prisma.sql`${expr} IN (${Prisma.join(items)})`;
      return op === "notIn" ? Prisma.sql`NOT (${inSql})` : inSql;
    }
    return { error: "unsupported_op" } as const;
  }

  if (fieldType === "number") {
    const numericExpr = buildNumericExpr(field);
    const num = coerceNumber(filter.value);
    if (num === null) return { error: "invalid_number_value" } as const;
    if (op === "eq" || op === "ne") {
      const comparator = op === "eq" ? "=" : "<>";
      return Prisma.sql`${numericExpr} ${Prisma.raw(comparator)} ${num}`;
    }
    if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
      const comparator = op === "gt" ? ">" : op === "gte" ? ">=" : op === "lt" ? "<" : "<=";
      return Prisma.sql`${numericExpr} ${Prisma.raw(comparator)} ${num}`;
    }
    if (op === "in" || op === "notIn") {
      const list = Array.isArray(filter.value) ? filter.value : [];
      const items = list.map((v) => coerceNumber(v));
      if (!items.length || items.some((v) => v === null)) return { error: "invalid_in_list" } as const;
      const inSql = Prisma.sql`${numericExpr} IN (${Prisma.join(items.map((v) => Prisma.sql`${v}`))})`;
      return op === "notIn" ? Prisma.sql`NOT (${inSql})` : inSql;
    }
    return { error: "unsupported_op" } as const;
  }

  if (fieldType === "date") {
    const dateExpr = buildDateExpr(field);
    const dateVal = coerceDate(filter.value);
    if (!dateVal) return { error: "invalid_date_value" } as const;
    if (op === "eq" || op === "ne") {
      const comparator = op === "eq" ? "=" : "<>";
      return Prisma.sql`${dateExpr} ${Prisma.raw(comparator)} ${dateVal}`;
    }
    if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
      const comparator = op === "gt" ? ">" : op === "gte" ? ">=" : op === "lt" ? "<" : "<=";
      return Prisma.sql`${dateExpr} ${Prisma.raw(comparator)} ${dateVal}`;
    }
    return { error: "unsupported_op" } as const;
  }

  if (fieldType === "boolean") {
    const expr = buildFieldExpr(field, fieldType);
    const boolVal = coerceBoolean(filter.value);
    if (boolVal === null) return { error: "invalid_boolean_value" } as const;
    const comparator = op === "ne" ? "<>" : "=";
    if (op === "eq" || op === "ne") {
      return Prisma.sql`${expr} ${Prisma.raw(comparator)} ${boolVal ? "true" : "false"}`;
    }
    return { error: "unsupported_op" } as const;
  }

  const expr = buildFieldExpr(field, fieldType);
  if (op === "eq" || op === "ne") {
    const comparator = op === "eq" ? "=" : "<>";
    return Prisma.sql`${expr} ${Prisma.raw(comparator)} ${String(filter.value ?? "")}`;
  }
  if (op === "contains" || op === "startsWith" || op === "endsWith") {
    const raw = String(filter.value ?? "");
    const pattern = op === "contains" ? `%${raw}%` : op === "startsWith" ? `${raw}%` : `%${raw}`;
    return Prisma.sql`${expr} ILIKE ${pattern}`;
  }
  if (op === "in" || op === "notIn") {
    const list = Array.isArray(filter.value) ? filter.value : [];
    const items = list.map((v) => Prisma.sql`${String(v)}`);
    if (!items.length) return { error: "empty_in_list" } as const;
    const inSql = Prisma.sql`${expr} IN (${Prisma.join(items)})`;
    return op === "notIn" ? Prisma.sql`NOT (${inSql})` : inSql;
  }

  return { error: "unsupported_op" } as const;
}

export async function handleAppRecordQuery(
  req: Request,
  pageId: string,
  modelOverride?: string | null,
  env: AppEnv = "prod"
) {
  const bodyRes = await parseJsonObject(req);
  if (bodyRes.error) return bodyRes.error;
  const body = bodyRes.data as QueryInput;
  const bodyModel = typeof body.model === "string" ? body.model.trim() : "";
  const overrideModel = typeof modelOverride === "string" ? modelOverride.trim() : "";
  if (overrideModel && bodyModel && bodyModel !== overrideModel) return apiErrorJson("bad_model", 400);
  const model = overrideModel || bodyModel;
  if (!model) return apiErrorJson("bad_model", 400);

  const anonUserId = await resolveAnonUserId(req);
  const appUser = await resolveAppUserFromRequest(pageId, req);
  const user = anonUserId
    ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } })
    : null;

  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, status: true, is_hidden: true, live_expires_at: true, deployed_at: true },
  });
  if (!page) return apiErrorJson("not_found", 404);
  const isOwner = Boolean(user && page.owner_id === user.id);
  if (!canAccessPublishedPage(page, isOwner)) return apiErrorJson("not_found", 404);

  const coll = await getCollectionBySlug(pageId, model, env);
  if (!coll) return apiErrorJson("collection_not_found", 404);
  const resolvedModel = toEnvSlug(model, env);
  const fields = (coll.fields ?? []) as AppFieldDef[];
  const fieldMap = new Map(fields.map((f) => [f.name, f]));
  const hasAppUserField = fieldMap.has("app_user_id");

  if (!isOwner && hasAppUserField && !appUser) return apiErrorJson("auth_required", 401);

  const filters: FilterInput[] = Array.isArray(body.filters)
    ? body.filters.map(normalizeFilter).filter((f): f is FilterInput => f !== null)
    : [];

  if (Array.isArray(body.filters) && filters.length !== body.filters.length) {
    return apiErrorJson("invalid_filters", 400);
  }

  const limit = clampNumber(body.limit, 50, 1, 200);
  const offset = clampNumber(body.offset, 0, 0, 1_000_000);
  const orderDir = body.orderDir === "asc" ? "asc" : "desc";
  const orderByRaw = typeof body.orderBy === "string" ? body.orderBy.trim() : "created_at";
  const orderByField = orderByRaw || "created_at";

  const isColumnField = (name: string) =>
    name === "id" || name === "created_at" || name === "updated_at" || (name === "app_user_id" && hasAppUserField);

  const allowedField = (name: string) => {
    if (!ALLOWED_FIELD.test(name)) return false;
    if (isColumnField(name)) return true;
    if (!fieldMap.has(name)) return false;
    return true;
  };

  if (!allowedField(orderByField)) return apiErrorJson("invalid_order_by", 400);

  const whereClauses: Prisma.Sql[] = [
    Prisma.sql`"page_id" = ${pageId}`,
    Prisma.sql`"collection_slug" = ${resolvedModel}`,
  ];

  if (!isOwner && hasAppUserField && appUser) {
    whereClauses.push(Prisma.sql`"app_user_id" = ${appUser.id}`);
  }

  for (const filter of filters) {
    if (!allowedField(filter.field)) return apiErrorJson("invalid_filter_field", 400);
    if (filter.field === "app_user_id" && !hasAppUserField) return apiErrorJson("invalid_filter_field", 400);
    if (!isOwner && filter.field === "app_user_id") {
      continue;
    }
    const type: AppFieldDef["type"] | "column" = isColumnField(filter.field)
      ? "column"
      : (fieldMap.get(filter.field)?.type ?? "string");
    const clause = buildFilterClause(filter, type);
    if ((clause as { error?: string }).error) {
      return apiErrorJson("invalid_filter", 400, { detail: (clause as { error: string }).error });
    }
    whereClauses.push(clause as Prisma.Sql);
  }

  if (body.search?.q) {
    const q = String(body.search.q ?? "").trim();
    if (q) {
      const requestedFields = Array.isArray(body.search.fields) ? body.search.fields : [];
      const stringFields = fields.filter((f) => f.type === "string").map((f) => f.name);
      const searchFields = (requestedFields.length ? requestedFields : stringFields).filter((f) => stringFields.includes(f));
      const orClauses = searchFields.map((field) => {
        const expr = buildFieldExpr(field, "string");
        return Prisma.sql`${expr} ILIKE ${`%${q}%`}`;
      });
      if (orClauses.length) {
        whereClauses.push(Prisma.sql`(${Prisma.join(orClauses, " OR ")})`);
      }
    }
  }

  const whereSql = Prisma.sql`WHERE ${Prisma.join(whereClauses, " AND ")}`;

  let orderExpr: Prisma.Sql;
  if (isColumnField(orderByField)) {
    orderExpr = Prisma.raw(`"${orderByField}"`);
  } else {
    const type = fieldMap.get(orderByField)?.type ?? "string";
    if (type === "number") {
      orderExpr = buildNumericExpr(orderByField);
    } else if (type === "date") {
      orderExpr = buildDateExpr(orderByField);
    } else {
      orderExpr = buildFieldExpr(orderByField, type);
    }
  }

  const itemsQuery = Prisma.sql`
    SELECT "id", "data", "created_at", "updated_at", "app_user_id"
    FROM "AppRecord"
    ${whereSql}
    ORDER BY ${orderExpr} ${Prisma.raw(orderDir)}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countQuery = Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "AppRecord"
    ${whereSql}
  `;

  const [items, countRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{ id: string; data: Record<string, unknown>; created_at: Date; updated_at: Date; app_user_id: string | null }>
    >(itemsQuery),
    prisma.$queryRaw<Array<{ count: number }>>(countQuery),
  ]);

  let aggregate: { op: string; field?: string; value: number | null } | null = null;
  if (body.aggregate) {
    const op = body.aggregate.op;
    const allowedAgg = new Set(["count", "sum", "avg", "min", "max"]);
    if (!allowedAgg.has(op)) return apiErrorJson("invalid_aggregate", 400);
    const field = typeof body.aggregate.field === "string" ? body.aggregate.field.trim() : "";
    if (op === "count") {
      const aggQuery = Prisma.sql`SELECT COUNT(*)::int AS value FROM "AppRecord" ${whereSql}`;
      const rows = await prisma.$queryRaw<Array<{ value: number }>>(aggQuery);
      aggregate = { op, value: rows[0]?.value ?? 0 };
    } else {
      if (!field || !allowedField(field)) return apiErrorJson("invalid_aggregate_field", 400);
      const fieldType = fieldMap.get(field)?.type;
      if (fieldType !== "number") return apiErrorJson("invalid_aggregate_field", 400, { detail: "numeric_only" });
      const numericExpr = buildNumericExpr(field);
      const aggQuery = Prisma.sql`
        SELECT ${Prisma.raw(op)}(${numericExpr})::float AS value
        FROM "AppRecord"
        ${whereSql}
      `;
      const rows = await prisma.$queryRaw<Array<{ value: number | null }>>(aggQuery);
      aggregate = { op, field, value: rows[0]?.value ?? null };
    }
  }

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      ...(item.data as object),
      app_user_id: item.app_user_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
    total: countRows[0]?.count ?? 0,
    limit,
    offset,
    aggregate,
  });
}
