import type { NodeDataBinding, NodeDataBindingFilter } from "@/advanced/doc/scene";
import type { FilterInput, FilterOp, QueryInput } from "@/lib/app-record-query";

const ALLOWED_ORDER_FIELDS = new Set(["created_at", "updated_at"]);
const ALLOWED_FILTER_OPS: FilterOp[] = [
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

type OverrideBag = Record<string, unknown>;

function resolveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function resolveLimit(overrides: OverrideBag, fallback?: number) {
  const value =
    resolveNumber(overrides.limit) ??
    resolveNumber(overrides.pageSize) ??
    resolveNumber(overrides.perPage) ??
    resolveNumber(overrides.page_size) ??
    resolveNumber(overrides.per_page);
  const next = value ?? (typeof fallback === "number" ? fallback : 50);
  return Math.max(1, Math.min(200, Math.round(next)));
}

function resolveOffset(overrides: OverrideBag, fallback?: number) {
  const offsetOverride = resolveNumber(overrides.offset) ?? resolveNumber(overrides.collection_offset);
  if (offsetOverride != null) return Math.max(0, Math.round(offsetOverride));
  const pageValue = resolveNumber(overrides.page) ?? resolveNumber(overrides.pageIndex);
  if (pageValue != null) {
    const limit = resolveLimit(overrides, fallback);
    return Math.max(0, Math.round((pageValue - 1) * limit));
  }
  return Math.max(0, Math.round(typeof fallback === "number" ? fallback : 0));
}

function normalizeFilterValue(op: FilterOp, value: unknown) {
  if (op === "exists" || op === "notExists") return undefined;
  if (op === "in" || op === "notIn") {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  }
  return value;
}

export function normalizeBindingFilters(filters?: NodeDataBindingFilter[]): FilterInput[] {
  if (!Array.isArray(filters)) return [];
  const normalized: FilterInput[] = [];
  filters.forEach((filter) => {
    if (!filter || typeof filter !== "object") return;
    const field = typeof filter.field === "string" ? filter.field.trim() : "";
    const op = typeof filter.op === "string" ? filter.op.trim() : "";
    if (!field || !ALLOWED_FILTER_OPS.includes(op as FilterOp)) return;
    normalized.push({
      field,
      op: op as FilterOp,
      value: normalizeFilterValue(op as FilterOp, filter.value),
    });
  });
  return normalized;
}

function normalizeSearchFields(fields?: string[]) {
  if (!Array.isArray(fields)) return [];
  return fields.map((f) => String(f ?? "").trim()).filter(Boolean);
}

export type BindingDecision =
  | { mode: "list"; params: URLSearchParams }
  | { mode: "query"; payload: QueryInput };

export type CollectionNodeDataBinding = Extract<NodeDataBinding, { type: "collection" }>;

export function buildBindingDecision(binding: CollectionNodeDataBinding, overrides?: OverrideBag): BindingDecision {
  const overrideBag = overrides ?? {};
  const limit = resolveLimit(overrideBag, binding.limit);
  const offset = resolveOffset(overrideBag, binding.offset);
  const orderDir = binding.orderDir === "asc" ? "asc" : "desc";
  const orderByRaw = typeof binding.orderBy === "string" ? binding.orderBy.trim() : "";
  const orderBy = orderByRaw || undefined;

  const filters = normalizeBindingFilters(binding.filters);
  const searchQ = binding.search?.q ? String(binding.search.q).trim() : "";
  const searchFields = normalizeSearchFields(binding.search?.fields);
  const hasSearch = Boolean(searchQ);
  const hasFilters = filters.length > 0;
  const needsQuery = hasFilters || hasSearch || (orderBy ? !ALLOWED_ORDER_FIELDS.has(orderBy) : false);

  if (needsQuery) {
    const payload: QueryInput = {
      model: binding.collectionId,
      filters: filters.length ? filters : undefined,
      search: hasSearch ? { q: searchQ, fields: searchFields.length ? searchFields : undefined } : undefined,
      orderBy: orderBy ?? "created_at",
      orderDir,
      limit,
      offset,
    };
    return { mode: "query", payload };
  }

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (orderBy && ALLOWED_ORDER_FIELDS.has(orderBy)) params.set("orderBy", orderBy);
  if (binding.orderDir === "asc") params.set("orderDir", "asc");
  return { mode: "list", params };
}
