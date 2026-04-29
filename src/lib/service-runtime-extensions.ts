import { prisma } from "@/lib/db";
import { executeServerlessNode } from "@/lib/serverless-executor";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";

export type ServiceRuntimeModuleKind = "generic" | "adapter" | "policy" | "search" | "ranking";
export type ServiceRuntimeFunctionTarget = "generic" | "policy_decision" | "ranking_transform" | "search_transform";
export type ServiceRuntimeNetworkMode = "inherit" | "deny_all" | "allow_list";

export type ServiceRuntimeModuleRecord = {
  id: string;
  page_id: string;
  key: string;
  name: string;
  kind: string;
  enabled: boolean;
  sandbox: unknown;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
};

export type ServiceRuntimeFunctionRecord = {
  id: string;
  page_id: string;
  module_id: string | null;
  key: string;
  name: string;
  target: string;
  enabled: boolean;
  code: string;
  timeout_ms: number;
  memory_mb: number;
  network_mode: string;
  network_allow: unknown;
  network_deny: unknown;
  secret_keys: unknown;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
  module?: ServiceRuntimeModuleRecord | null;
};

export type ServiceRuntimeExtensionSnapshot = {
  modules: ServiceRuntimeModuleRecord[];
  functions: ServiceRuntimeFunctionRecord[];
};

export type ServiceRuntimeModuleLoader = (module: ServiceRuntimeModuleRecord) => Promise<void> | void;

type ServiceRuntimeExtensionsPrisma = {
  serviceRuntimeModule?: {
    findMany(args?: Record<string, unknown>): Promise<unknown[]>;
    findUnique?(args: Record<string, unknown>): Promise<unknown | null>;
    upsert(args: { where: Record<string, unknown>; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<unknown>;
  };
  serviceRuntimeFunction?: {
    findMany(args?: Record<string, unknown>): Promise<unknown[]>;
    findFirst?(args: Record<string, unknown>): Promise<unknown | null>;
    upsert(args: { where: Record<string, unknown>; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<unknown>;
  };
};

const runtimeExtensionsPrisma = prisma as unknown as ServiceRuntimeExtensionsPrisma;
const moduleLoaders = new Map<string, ServiceRuntimeModuleLoader>();
const runtimeAdapters = new Map<string, unknown>();
const loadedModules = new Map<string, string>();

function normalizeKey(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || fallback;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const num = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeBoolean(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function normalizeModuleKind(value: unknown): ServiceRuntimeModuleKind {
  const kind = normalizeKey(value, "generic").toLowerCase();
  if (kind === "adapter" || kind === "policy" || kind === "search" || kind === "ranking") return kind;
  return "generic";
}

function normalizeFunctionTarget(value: unknown): ServiceRuntimeFunctionTarget {
  const target = normalizeKey(value, "generic").toLowerCase();
  if (target === "policy_decision" || target === "ranking_transform" || target === "search_transform") return target;
  return "generic";
}

function normalizeNetworkMode(value: unknown): ServiceRuntimeNetworkMode {
  const mode = normalizeKey(value, "inherit").toLowerCase();
  if (mode === "deny_all" || mode === "allow_list") return mode;
  return "inherit";
}

function normalizeModuleRecord(value: unknown): ServiceRuntimeModuleRecord {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    page_id: String(record.page_id ?? ""),
    key: normalizeKey(record.key, "module"),
    name: normalizeKey(record.name, "Runtime module"),
    kind: normalizeModuleKind(record.kind),
    enabled: normalizeBoolean(record.enabled, true),
    sandbox: record.sandbox ?? null,
    metadata: record.metadata ?? null,
    created_at: record.created_at instanceof Date ? record.created_at : new Date(0),
    updated_at: record.updated_at instanceof Date ? record.updated_at : new Date(0),
  };
}

function normalizeFunctionRecord(value: unknown): ServiceRuntimeFunctionRecord {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    page_id: String(record.page_id ?? ""),
    module_id: normalizeOptionalText(record.module_id),
    key: normalizeKey(record.key, "runtime_function"),
    name: normalizeKey(record.name, "Runtime function"),
    target: normalizeFunctionTarget(record.target),
    enabled: normalizeBoolean(record.enabled, true),
    code: String(record.code ?? ""),
    timeout_ms: clamp(record.timeout_ms, 10000, 100, 30000),
    memory_mb: clamp(record.memory_mb, 128, 64, 1024),
    network_mode: normalizeNetworkMode(record.network_mode),
    network_allow: record.network_allow ?? [],
    network_deny: record.network_deny ?? [],
    secret_keys: record.secret_keys ?? [],
    metadata: record.metadata ?? null,
    created_at: record.created_at instanceof Date ? record.created_at : new Date(0),
    updated_at: record.updated_at instanceof Date ? record.updated_at : new Date(0),
    module: record.module ? normalizeModuleRecord(record.module) : null,
  };
}

function toJson(value: unknown) {
  return value as object;
}

function toExtensionObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function audit(pageId: string, action: string, targetType: string, targetId: string | null, meta: Record<string, unknown> | null, actor?: AppAuditActor) {
  await logAppAudit({ pageId, action, targetType, targetId, meta, actor });
}

export function registerServiceRuntimeModuleLoader(kind: string, loader: ServiceRuntimeModuleLoader) {
  moduleLoaders.set(normalizeModuleKind(kind), loader);
}

export function registerServiceRuntimeAdapter(type: string, name: string, adapter: unknown) {
  runtimeAdapters.set(`${normalizeKey(type, "generic")}:${normalizeKey(name, "adapter")}`, adapter);
}

export function getServiceRuntimeAdapter(type: string, name: string) {
  return runtimeAdapters.get(`${normalizeKey(type, "generic")}:${normalizeKey(name, "adapter")}`) ?? null;
}

export function listServiceRuntimeAdapters(type?: string) {
  const prefix = type ? `${normalizeKey(type, "generic")}:` : null;
  return Array.from(runtimeAdapters.entries())
    .filter(([key]) => (prefix ? key.startsWith(prefix) : true))
    .map(([key, adapter]) => ({ key, adapter }));
}

export function resetServiceRuntimeExtensionRegistry() {
  moduleLoaders.clear();
  runtimeAdapters.clear();
  loadedModules.clear();
}

export async function listServiceRuntimeExtensions(pageId: string): Promise<ServiceRuntimeExtensionSnapshot> {
  if (!runtimeExtensionsPrisma.serviceRuntimeModule || !runtimeExtensionsPrisma.serviceRuntimeFunction) {
    return { modules: [], functions: [] };
  }
  const [modulesRaw, functionsRaw] = await Promise.all([
    runtimeExtensionsPrisma.serviceRuntimeModule.findMany({
      where: { page_id: pageId },
      orderBy: [{ kind: "asc" }, { key: "asc" }],
    }),
    runtimeExtensionsPrisma.serviceRuntimeFunction.findMany({
      where: { page_id: pageId },
      include: { module: true },
      orderBy: [{ target: "asc" }, { key: "asc" }],
    }),
  ]);
  return {
    modules: modulesRaw.map(normalizeModuleRecord),
    functions: functionsRaw.map(normalizeFunctionRecord),
  };
}

export async function upsertServiceRuntimeModule(input: {
  pageId: string;
  key: string;
  name: string;
  kind?: ServiceRuntimeModuleKind | string;
  enabled?: boolean;
  sandbox?: unknown;
  metadata?: unknown;
  actor?: AppAuditActor;
}) {
  if (!runtimeExtensionsPrisma.serviceRuntimeModule) {
    throw new Error("service_runtime_module_storage_unavailable");
  }
  const key = normalizeKey(input.key, "runtime_module");
  const record = normalizeModuleRecord(
    await runtimeExtensionsPrisma.serviceRuntimeModule.upsert({
      where: { page_id_key: { page_id: input.pageId, key } },
      update: {
        name: input.name,
        kind: normalizeModuleKind(input.kind),
        enabled: normalizeBoolean(input.enabled, true),
        sandbox: toJson(input.sandbox ?? null),
        metadata: toJson(input.metadata ?? null),
      },
      create: {
        page_id: input.pageId,
        key,
        name: input.name,
        kind: normalizeModuleKind(input.kind),
        enabled: normalizeBoolean(input.enabled, true),
        sandbox: toJson(input.sandbox ?? null),
        metadata: toJson(input.metadata ?? null),
      },
    }),
  );
  await audit(input.pageId, "service_runtime_module_upsert", "service_runtime_module", record.id, { key: record.key, kind: record.kind }, input.actor);
  return record;
}

export async function upsertServiceRuntimeFunction(input: {
  pageId: string;
  key: string;
  name: string;
  target?: ServiceRuntimeFunctionTarget | string;
  enabled?: boolean;
  moduleKey?: string | null;
  code: string;
  timeoutMs?: number;
  memoryMb?: number;
  networkMode?: ServiceRuntimeNetworkMode | string;
  networkAllow?: string[];
  networkDeny?: string[];
  secretKeys?: string[];
  metadata?: unknown;
  actor?: AppAuditActor;
}) {
  if (!runtimeExtensionsPrisma.serviceRuntimeFunction) {
    throw new Error("service_runtime_function_storage_unavailable");
  }
  const key = normalizeKey(input.key, "runtime_function");
  let moduleId: string | null = null;
  if (input.moduleKey && runtimeExtensionsPrisma.serviceRuntimeModule?.findUnique) {
    const moduleRow = await runtimeExtensionsPrisma.serviceRuntimeModule.findUnique({
      where: { page_id_key: { page_id: input.pageId, key: normalizeKey(input.moduleKey, "module") } },
    });
    if (!moduleRow) throw new Error("service_runtime_module_not_found");
    moduleId = normalizeModuleRecord(moduleRow).id;
  }
  const record = normalizeFunctionRecord(
    await runtimeExtensionsPrisma.serviceRuntimeFunction.upsert({
      where: { page_id_key: { page_id: input.pageId, key } },
      update: {
        module_id: moduleId,
        name: input.name,
        target: normalizeFunctionTarget(input.target),
        enabled: normalizeBoolean(input.enabled, true),
        code: String(input.code ?? ""),
        timeout_ms: clamp(input.timeoutMs, 10000, 100, 30000),
        memory_mb: clamp(input.memoryMb, 128, 64, 1024),
        network_mode: normalizeNetworkMode(input.networkMode),
        network_allow: toJson(normalizeStringArray(input.networkAllow)),
        network_deny: toJson(normalizeStringArray(input.networkDeny)),
        secret_keys: toJson(normalizeStringArray(input.secretKeys)),
        metadata: toJson(input.metadata ?? null),
      },
      create: {
        page_id: input.pageId,
        module_id: moduleId,
        key,
        name: input.name,
        target: normalizeFunctionTarget(input.target),
        enabled: normalizeBoolean(input.enabled, true),
        code: String(input.code ?? ""),
        timeout_ms: clamp(input.timeoutMs, 10000, 100, 30000),
        memory_mb: clamp(input.memoryMb, 128, 64, 1024),
        network_mode: normalizeNetworkMode(input.networkMode),
        network_allow: toJson(normalizeStringArray(input.networkAllow)),
        network_deny: toJson(normalizeStringArray(input.networkDeny)),
        secret_keys: toJson(normalizeStringArray(input.secretKeys)),
        metadata: toJson(input.metadata ?? null),
      },
    }),
  );
  await audit(input.pageId, "service_runtime_function_upsert", "service_runtime_function", record.id, { key: record.key, target: record.target }, input.actor);
  return record;
}

export async function loadServiceRuntimeModules(pageId: string) {
  if (!runtimeExtensionsPrisma.serviceRuntimeModule) return { loaded: 0, skipped: 0 };
  const modules = (await runtimeExtensionsPrisma.serviceRuntimeModule.findMany({
    where: { page_id: pageId, enabled: true },
    orderBy: [{ kind: "asc" }, { key: "asc" }],
  })).map(normalizeModuleRecord);

  let loaded = 0;
  let skipped = 0;
  for (const runtimeModule of modules) {
    const loader = moduleLoaders.get(normalizeModuleKind(runtimeModule.kind));
    if (!loader) {
      skipped += 1;
      continue;
    }
    const signature = `${runtimeModule.page_id}:${runtimeModule.key}:${runtimeModule.updated_at.toISOString()}`;
    if (loadedModules.get(`${runtimeModule.page_id}:${runtimeModule.key}`) === signature) {
      skipped += 1;
      continue;
    }
    await Promise.resolve(loader(runtimeModule));
    loadedModules.set(`${runtimeModule.page_id}:${runtimeModule.key}`, signature);
    loaded += 1;
  }
  return { loaded, skipped };
}

function buildNetworkPolicy(record: ServiceRuntimeFunctionRecord) {
  const allow = normalizeStringArray(record.network_allow);
  const deny = normalizeStringArray(record.network_deny);
  const mode = normalizeNetworkMode(record.network_mode);
  if (mode === "deny_all") {
    return { allow: [] as string[], deny: ["*"] };
  }
  if (mode === "allow_list") {
    return { allow, deny };
  }
  return {
    allow: allow.length ? allow : undefined,
    deny: deny.length ? deny : undefined,
  };
}

async function resolveFunctionByKey(pageId: string, key: string) {
  if (!runtimeExtensionsPrisma.serviceRuntimeFunction?.findFirst) return null;
  const row = await runtimeExtensionsPrisma.serviceRuntimeFunction.findFirst({
    where: { page_id: pageId, key: normalizeKey(key, "runtime_function"), enabled: true },
    include: { module: true },
  });
  return row ? normalizeFunctionRecord(row) : null;
}

async function listFunctionsByTarget(pageId: string, target: ServiceRuntimeFunctionTarget | string) {
  if (!runtimeExtensionsPrisma.serviceRuntimeFunction?.findMany) return [] as ServiceRuntimeFunctionRecord[];
  const rows = await runtimeExtensionsPrisma.serviceRuntimeFunction.findMany({
    where: { page_id: pageId, target: normalizeFunctionTarget(target), enabled: true },
    include: { module: true },
    orderBy: [{ key: "asc" }],
  });
  return rows.map(normalizeFunctionRecord);
}

async function executeResolvedServiceRuntimeFunction(
  record: ServiceRuntimeFunctionRecord,
  input: {
    inputs?: unknown;
    context?: { variables?: Record<string, unknown>; triggerData?: unknown };
  },
) {
  const policy = buildNetworkPolicy(record);
  return executeServerlessNode({
    pageId: record.page_id,
    code: record.code,
    inputs: input.inputs,
    timeoutMs: record.timeout_ms,
    memoryMb: record.memory_mb,
    secrets: normalizeStringArray(record.secret_keys),
    variables: input.context?.variables,
    triggerData: input.context?.triggerData,
    policy: { network: policy },
  });
}

export async function executeServiceRuntimeFunction(input: {
  pageId: string;
  key: string;
  inputs?: unknown;
  context?: { variables?: Record<string, unknown>; triggerData?: unknown };
  actor?: AppAuditActor;
}) {
  await loadServiceRuntimeModules(input.pageId);
  const record = await resolveFunctionByKey(input.pageId, input.key);
  if (!record) throw new Error("service_runtime_function_not_found");
  const result = await executeResolvedServiceRuntimeFunction(record, {
    inputs: input.inputs,
    context: input.context,
  });
  await audit(input.pageId, "service_runtime_function_execute", "service_runtime_function", record.id, {
    key: record.key,
    target: record.target,
    ok: result.ok,
    error: result.error ?? null,
  }, input.actor);
  return { record, result };
}

export async function runServiceRuntimeTargetFunctions(input: {
  pageId: string;
  target: ServiceRuntimeFunctionTarget | string;
  inputs?: unknown;
  context?: { variables?: Record<string, unknown>; triggerData?: unknown };
}) {
  await loadServiceRuntimeModules(input.pageId);
  const records = await listFunctionsByTarget(input.pageId, input.target);
  const executed = [];
  for (const record of records) {
    const result = await executeResolvedServiceRuntimeFunction(record, {
      inputs: input.inputs,
      context: input.context,
    });
    executed.push({ record, result });
  }
  return executed;
}

export async function applyServiceSearchRuntimeExtensions<T extends { items: unknown[]; total: number; limit: number; offset: number }>(
  pageId: string,
  result: T,
  payload: Record<string, unknown>,
) {
  const executions = await runServiceRuntimeTargetFunctions({
    pageId,
    target: "search_transform",
    inputs: payload,
    context: { triggerData: payload },
  });

  let next = { ...result };
  for (const execution of executions) {
    if (!execution.result.ok) continue;
    const data = toExtensionObject(execution.result.result);
    if (Array.isArray(data.items)) {
      next = { ...next, items: data.items as T["items"] };
    }
    if (typeof data.total === "number") next = { ...next, total: data.total };
    if (typeof data.limit === "number") next = { ...next, limit: data.limit };
    if (typeof data.offset === "number") next = { ...next, offset: data.offset };
  }
  return next;
}

export async function applyServiceRankingRuntimeExtensions<T extends { items: unknown[]; total: number; limit: number; offset: number }>(
  pageId: string,
  result: T,
  payload: Record<string, unknown>,
) {
  const executions = await runServiceRuntimeTargetFunctions({
    pageId,
    target: "ranking_transform",
    inputs: payload,
    context: { triggerData: payload },
  });

  let next = { ...result };
  for (const execution of executions) {
    if (!execution.result.ok) continue;
    const data = toExtensionObject(execution.result.result);
    if (Array.isArray(data.items)) {
      next = { ...next, items: data.items as T["items"] };
    }
    if (typeof data.total === "number") next = { ...next, total: data.total };
    if (typeof data.limit === "number") next = { ...next, limit: data.limit };
    if (typeof data.offset === "number") next = { ...next, offset: data.offset };
  }
  return next;
}

export async function applyServicePolicyRuntimeExtensions<T extends {
  decision: "allow" | "deny" | "review";
  allowed: boolean;
  requiresApproval: boolean;
  blocked: boolean;
  riskScore: number;
  reasons: string[];
}>(
  pageId: string,
  evaluation: T,
  payload: Record<string, unknown>,
) {
  const executions = await runServiceRuntimeTargetFunctions({
    pageId,
    target: "policy_decision",
    inputs: payload,
    context: { triggerData: payload },
  });

  const next = { ...evaluation, reasons: [...evaluation.reasons] };
  for (const execution of executions) {
    if (!execution.result.ok) continue;
    const data = toExtensionObject(execution.result.result);
    const decision = typeof data.decision === "string" ? data.decision.trim().toLowerCase() : "";
    if (decision === "allow" || decision === "deny" || decision === "review") {
      next.decision = decision;
      next.allowed = decision === "allow";
      next.requiresApproval = decision === "review";
      next.blocked = decision === "deny";
    }
    if (typeof data.riskScoreDelta === "number" && Number.isFinite(data.riskScoreDelta)) {
      next.riskScore += data.riskScoreDelta;
    }
    if (Array.isArray(data.reasons)) {
      for (const reason of data.reasons.map((value) => String(value)).filter(Boolean)) {
        if (!next.reasons.includes(reason)) next.reasons.push(reason);
      }
    }
  }
  return next;
}
