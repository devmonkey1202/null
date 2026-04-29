import { beforeEach, describe, expect, it, vi } from "vitest";

type ModuleRow = {
  id: string;
  page_id: string;
  key: string;
  name: string;
  kind: string;
  enabled: boolean;
  sandbox: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type FunctionRow = {
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
  network_allow: string[];
  network_deny: string[];
  secret_keys: string[];
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

const state = vi.hoisted(() => ({
  seq: 0,
  modules: [] as ModuleRow[],
  functions: [] as FunctionRow[],
}));

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const logAppAuditMock = vi.hoisted(() => vi.fn());
const executeServerlessNodeMock = vi.hoisted(() => vi.fn(async (input: any) => {
  if (String(input.code).includes("policyOverride")) {
    return { ok: true, result: { decision: "deny", reasons: ["ext:policy"], riskScoreDelta: 7 }, logs: [] };
  }
  if (String(input.code).includes("searchTransform")) {
    return { ok: true, result: { items: [{ id: "search_ext" }], total: 1, limit: 1, offset: 0 }, logs: [] };
  }
  if (String(input.code).includes("rankingTransform")) {
    return { ok: true, result: { items: [{ id: "ranking_ext" }], total: 1, limit: 1, offset: 0 }, logs: [] };
  }
  return { ok: true, result: { echo: input.inputs ?? null }, logs: [] };
}));

const prismaMock = vi.hoisted(() => ({
  serviceRuntimeModule: {
    findMany: vi.fn(async ({ where }: any = {}) => {
      let rows = state.modules.slice();
      if (where?.page_id) rows = rows.filter((item) => item.page_id === where.page_id);
      if (where?.enabled !== undefined) rows = rows.filter((item) => item.enabled === where.enabled);
      return clone(rows);
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where.page_id_key;
      return clone(state.modules.find((item) => item.page_id === key.page_id && item.key === key.key) ?? null);
    }),
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.modules.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("module"),
        page_id: String(create.page_id),
        key: String(create.key),
        name: String(create.name),
        kind: String(create.kind),
        enabled: Boolean(create.enabled),
        sandbox: (create.sandbox as Record<string, unknown> | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.modules.push(row);
      return clone(row);
    }),
  },
  serviceRuntimeFunction: {
    findMany: vi.fn(async ({ where, include }: any = {}) => {
      let rows = state.functions.slice();
      if (where?.page_id) rows = rows.filter((item) => item.page_id === where.page_id);
      if (where?.target) rows = rows.filter((item) => item.target === where.target);
      if (where?.enabled !== undefined) rows = rows.filter((item) => item.enabled === where.enabled);
      return clone(
        rows.map((item) => ({
          ...item,
          ...(include?.module
            ? { module: state.modules.find((module) => module.id === item.module_id) ?? null }
            : {}),
        })),
      );
    }),
    findFirst: vi.fn(async ({ where, include }: any) => {
      const row = state.functions.find(
        (item) =>
          item.page_id === where.page_id &&
          item.key === where.key &&
          (where.enabled === undefined || item.enabled === where.enabled),
      );
      if (!row) return null;
      return clone({
        ...row,
        ...(include?.module ? { module: state.modules.find((module) => module.id === row.module_id) ?? null } : {}),
      });
    }),
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.functions.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("function"),
        page_id: String(create.page_id),
        module_id: (create.module_id as string | null) ?? null,
        key: String(create.key),
        name: String(create.name),
        target: String(create.target),
        enabled: Boolean(create.enabled),
        code: String(create.code),
        timeout_ms: Number(create.timeout_ms),
        memory_mb: Number(create.memory_mb),
        network_mode: String(create.network_mode),
        network_allow: (create.network_allow as string[]) ?? [],
        network_deny: (create.network_deny as string[]) ?? [],
        secret_keys: (create.secret_keys as string[]) ?? [],
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.functions.push(row);
      return clone(row);
    }),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: logAppAuditMock }));
vi.mock("@/lib/serverless-executor", () => ({ executeServerlessNode: executeServerlessNodeMock }));

import {
  applyServicePolicyRuntimeExtensions,
  applyServiceRankingRuntimeExtensions,
  applyServiceSearchRuntimeExtensions,
  executeServiceRuntimeFunction,
  getServiceRuntimeAdapter,
  listServiceRuntimeExtensions,
  loadServiceRuntimeModules,
  registerServiceRuntimeAdapter,
  registerServiceRuntimeModuleLoader,
  resetServiceRuntimeExtensionRegistry,
  upsertServiceRuntimeFunction,
  upsertServiceRuntimeModule,
} from "@/lib/service-runtime-extensions";

describe("service runtime extensions", () => {
  beforeEach(() => {
    state.seq = 0;
    state.modules = [];
    state.functions = [];
    prismaMock.serviceRuntimeModule.findMany.mockClear();
    prismaMock.serviceRuntimeModule.findUnique.mockClear();
    prismaMock.serviceRuntimeModule.upsert.mockClear();
    prismaMock.serviceRuntimeFunction.findMany.mockClear();
    prismaMock.serviceRuntimeFunction.findFirst.mockClear();
    prismaMock.serviceRuntimeFunction.upsert.mockClear();
    logAppAuditMock.mockReset();
    executeServerlessNodeMock.mockClear();
    resetServiceRuntimeExtensionRegistry();
  });

  it("upserts modules/functions and lists them", async () => {
    await upsertServiceRuntimeModule({
      pageId: "page_1",
      key: "search_mod",
      name: "Search Module",
      kind: "search",
    });
    await upsertServiceRuntimeFunction({
      pageId: "page_1",
      moduleKey: "search_mod",
      key: "search_fn",
      name: "Search Transform",
      target: "search_transform",
      code: "searchTransform",
    });

    const snapshot = await listServiceRuntimeExtensions("page_1");
    expect(snapshot.modules).toHaveLength(1);
    expect(snapshot.functions).toHaveLength(1);
    expect(snapshot.functions[0]?.module?.key).toBe("search_mod");
  });

  it("loads modules through registered loaders once per module version", async () => {
    const loader = vi.fn();
    registerServiceRuntimeModuleLoader("search", loader);

    await upsertServiceRuntimeModule({
      pageId: "page_1",
      key: "search_mod",
      name: "Search Module",
      kind: "search",
    });

    const first = await loadServiceRuntimeModules("page_1");
    const second = await loadServiceRuntimeModules("page_1");

    expect(first.loaded).toBe(1);
    expect(second.loaded).toBe(0);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("registers custom adapters and exposes them", () => {
    const adapter = { name: "adapter-a" };
    registerServiceRuntimeAdapter("search", "adapter-a", adapter);
    expect(getServiceRuntimeAdapter("search", "adapter-a")).toBe(adapter);
  });

  it("executes custom functions with sandbox policy and secret keys", async () => {
    await upsertServiceRuntimeFunction({
      pageId: "page_1",
      key: "generic_fn",
      name: "Generic Function",
      target: "generic",
      code: "echo",
      networkMode: "allow_list",
      networkAllow: ["api.example.com"],
      networkDeny: ["internal.local"],
      secretKeys: ["alpha", "beta"],
      timeoutMs: 12000,
      memoryMb: 256,
    });

    const executed = await executeServiceRuntimeFunction({
      pageId: "page_1",
      key: "generic_fn",
      inputs: { hello: "world" },
    });

    expect(executed.result.ok).toBe(true);
    expect(executeServerlessNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page_1",
        timeoutMs: 12000,
        memoryMb: 256,
        secrets: ["alpha", "beta"],
        policy: {
          network: {
            allow: ["api.example.com"],
            deny: ["internal.local"],
          },
        },
      }),
    );
  });

  it("applies custom policy/search/ranking target functions", async () => {
    await upsertServiceRuntimeFunction({
      pageId: "page_1",
      key: "policy_fn",
      name: "Policy Override",
      target: "policy_decision",
      code: "policyOverride",
    });
    await upsertServiceRuntimeFunction({
      pageId: "page_1",
      key: "search_fn",
      name: "Search Transform",
      target: "search_transform",
      code: "searchTransform",
    });
    await upsertServiceRuntimeFunction({
      pageId: "page_1",
      key: "ranking_fn",
      name: "Ranking Transform",
      target: "ranking_transform",
      code: "rankingTransform",
    });

    const policy = await applyServicePolicyRuntimeExtensions(
      "page_1",
      {
        decision: "allow",
        allowed: true,
        requiresApproval: false,
        blocked: false,
        riskScore: 2,
        reasons: ["base"],
      },
      { subjectKey: "user:1" },
    );
    expect(policy.decision).toBe("deny");
    expect(policy.riskScore).toBe(9);
    expect(policy.reasons).toContain("ext:policy");

    const search = await applyServiceSearchRuntimeExtensions(
      "page_1",
      { items: [{ id: "base" }], total: 1, limit: 20, offset: 0 },
      { q: "hello" },
    );
    expect(search.items).toEqual([{ id: "search_ext" }]);

    const ranking = await applyServiceRankingRuntimeExtensions(
      "page_1",
      { items: [{ id: "base" }], total: 1, limit: 20, offset: 0 },
      { feed: true },
    );
    expect(ranking.items).toEqual([{ id: "ranking_ext" }]);
  });
});
