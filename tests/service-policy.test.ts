import { beforeEach, describe, expect, it, vi } from "vitest";

type RuleRow = {
  id: string;
  page_id: string;
  key: string;
  name: string;
  effect: string;
  action_key: string;
  resource_type: string;
  priority: number;
  enabled: boolean;
  conditions: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type ApprovalRow = {
  id: string;
  page_id: string;
  rule_id: string | null;
  action_key: string;
  resource_type: string;
  subject_key: string;
  subject_label: string | null;
  target_key: string | null;
  status: string;
  note: string | null;
  context: Record<string, unknown> | null;
  requested_by_user_id: string | null;
  requested_by_app_user_id: string | null;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type OverrideRow = {
  id: string;
  page_id: string;
  rule_id: string | null;
  key: string;
  subject_key: string;
  effect: string;
  action_key: string | null;
  resource_type: string | null;
  reason: string | null;
  enabled: boolean;
  expires_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type IncidentRow = {
  id: string;
  page_id: string;
  key: string;
  subject_key: string;
  category: string;
  source_type: string;
  source_id: string | null;
  status: string;
  score: number;
  signal_count: number;
  detail: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type SanctionRow = {
  id: string;
  page_id: string;
  incident_id: string | null;
  key: string;
  subject_key: string;
  sanction_type: string;
  action_key: string | null;
  resource_type: string | null;
  status: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  starts_at: Date;
  expires_at: Date | null;
  released_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const state = vi.hoisted(() => ({
  seq: 0,
  rules: [] as RuleRow[],
  approvals: [] as ApprovalRow[],
  overrides: [] as OverrideRow[],
  incidents: [] as IncidentRow[],
  sanctions: [] as SanctionRow[],
}));

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const logAppAuditMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  servicePolicyRule: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.rules.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("rule"),
        page_id: String(create.page_id),
        key: String(create.key),
        name: String(create.name),
        effect: String(create.effect),
        action_key: String(create.action_key),
        resource_type: String(create.resource_type),
        priority: Number(create.priority),
        enabled: Boolean(create.enabled),
        conditions: (create.conditions as Record<string, unknown> | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.rules.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.rules.filter(
        (item) =>
          item.page_id === where.page_id &&
          (where.enabled === undefined || item.enabled === where.enabled) &&
          (!where.action_key?.in || where.action_key.in.includes(item.action_key)) &&
          (!where.resource_type?.in || where.resource_type.in.includes(item.resource_type)),
      );
      if (Array.isArray(orderBy)) {
        rows = rows.slice().sort((left, right) => {
          if (left.priority !== right.priority) return right.priority - left.priority;
          return right.created_at.getTime() - left.created_at.getTime();
        });
      }
      return clone(rows);
    }),
  },
  servicePolicyApprovalRequest: {
    create: vi.fn(async ({ data }: any) => {
      const row: ApprovalRow = {
        id: nextId("approval"),
        page_id: String(data.page_id),
        rule_id: (data.rule_id as string | null) ?? null,
        action_key: String(data.action_key),
        resource_type: String(data.resource_type),
        subject_key: String(data.subject_key),
        subject_label: (data.subject_label as string | null) ?? null,
        target_key: (data.target_key as string | null) ?? null,
        status: String(data.status),
        note: (data.note as string | null) ?? null,
        context: (data.context as Record<string, unknown> | null) ?? null,
        requested_by_user_id: (data.requested_by_user_id as string | null) ?? null,
        requested_by_app_user_id: (data.requested_by_app_user_id as string | null) ?? null,
        decided_by_user_id: (data.decided_by_user_id as string | null) ?? null,
        decided_at: (data.decided_at as Date | null) ?? null,
        expires_at: (data.expires_at as Date | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.approvals.push(row);
      return clone(row);
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return clone(state.approvals.find((item) => item.id === where.id && item.page_id === where.page_id) ?? null);
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.approvals.find((item) => item.id === where.id);
      if (!row) throw new Error("approval_not_found");
      Object.assign(row, data, { updated_at: new Date() });
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.approvals.filter(
        (item) =>
          item.page_id === where.page_id &&
          (where.subject_key === undefined || item.subject_key === where.subject_key) &&
          (where.action_key === undefined || item.action_key === where.action_key) &&
          (where.resource_type === undefined || item.resource_type === where.resource_type),
      );
      if (orderBy?.updated_at === "desc") rows = rows.slice().sort((left, right) => right.updated_at.getTime() - left.updated_at.getTime());
      if (orderBy?.created_at === "desc") rows = rows.slice().sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
      return clone(rows);
    }),
  },
  servicePolicyOverride: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.overrides.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("override"),
        page_id: String(create.page_id),
        rule_id: (create.rule_id as string | null) ?? null,
        key: String(create.key),
        subject_key: String(create.subject_key),
        effect: String(create.effect),
        action_key: (create.action_key as string | null) ?? null,
        resource_type: (create.resource_type as string | null) ?? null,
        reason: (create.reason as string | null) ?? null,
        enabled: Boolean(create.enabled),
        expires_at: (create.expires_at as Date | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.overrides.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.overrides.filter(
        (item) =>
          item.page_id === where.page_id &&
          (where.subject_key === undefined || item.subject_key === where.subject_key) &&
          (where.enabled === undefined || item.enabled === where.enabled),
      );
      if (orderBy?.created_at === "desc") rows = rows.slice().sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
      return clone(rows);
    }),
  },
  serviceRiskIncident: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.incidents.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("incident"),
        page_id: String(create.page_id),
        key: String(create.key),
        subject_key: String(create.subject_key),
        category: String(create.category),
        source_type: String(create.source_type),
        source_id: (create.source_id as string | null) ?? null,
        status: String(create.status),
        score: Number(create.score),
        signal_count: Number(create.signal_count),
        detail: (create.detail as Record<string, unknown> | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        resolved_at: (create.resolved_at as Date | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.incidents.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.incidents.filter(
        (item) =>
          item.page_id === where.page_id &&
          (where.subject_key === undefined || item.subject_key === where.subject_key) &&
          (!where.status?.in || where.status.in.includes(item.status)),
      );
      if (orderBy?.created_at === "desc") rows = rows.slice().sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
      return clone(rows);
    }),
  },
  serviceRiskSanction: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.sanctions.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("sanction"),
        page_id: String(create.page_id),
        incident_id: (create.incident_id as string | null) ?? null,
        key: String(create.key),
        subject_key: String(create.subject_key),
        sanction_type: String(create.sanction_type),
        action_key: (create.action_key as string | null) ?? null,
        resource_type: (create.resource_type as string | null) ?? null,
        status: String(create.status),
        reason: (create.reason as string | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        starts_at: (create.starts_at as Date) ?? new Date(),
        expires_at: (create.expires_at as Date | null) ?? null,
        released_at: (create.released_at as Date | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.sanctions.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.sanctions.filter(
        (item) =>
          item.page_id === where.page_id &&
          (where.subject_key === undefined || item.subject_key === where.subject_key) &&
          (where.status === undefined || item.status === where.status),
      );
      if (orderBy?.created_at === "desc") rows = rows.slice().sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
      return clone(rows);
    }),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: logAppAuditMock }));

import {
  createServiceApprovalRequest,
  decideServiceApprovalRequest,
  evaluateServicePolicy,
  listServicePolicyState,
  recordServiceRiskIncident,
  upsertServicePolicyOverride,
  upsertServicePolicyRule,
  upsertServiceRiskSanction,
} from "@/lib/service-policy";

describe("service policy", () => {
  beforeEach(() => {
    state.seq = 0;
    state.rules = [];
    state.approvals = [];
    state.overrides = [];
    state.incidents = [];
    state.sanctions = [];
    logAppAuditMock.mockReset();
  });

  it("upserts rules and exposes state", async () => {
    await upsertServicePolicyRule({
      pageId: "page_1",
      key: "orders-deny",
      name: "Deny high-risk order",
      effect: "deny",
      actionKey: "order.submit",
      resourceType: "order",
      priority: 500,
    });

    const stateView = await listServicePolicyState("page_1");
    expect(stateView.rules).toHaveLength(1);
    expect(stateView.rules[0]?.key).toBe("orders-deny");
    expect(logAppAuditMock).toHaveBeenCalled();
  });

  it("evaluates rules and subject overrides", async () => {
    await upsertServicePolicyRule({
      pageId: "page_1",
      key: "deny-risky",
      name: "Deny risky payout",
      effect: "deny",
      actionKey: "payout.request",
      resourceType: "payout",
      conditions: { riskLevel: "high" },
      priority: 700,
    });

    await upsertServicePolicyOverride({
      pageId: "page_1",
      key: "vip-override",
      subjectKey: "user:vip",
      effect: "allow",
      actionKey: "payout.request",
      resourceType: "payout",
    });

    const blocked = await evaluateServicePolicy({
      pageId: "page_1",
      subjectKey: "user:basic",
      actionKey: "payout.request",
      resourceType: "payout",
      context: { riskLevel: "high" },
    });
    expect(blocked.decision).toBe("deny");

    const allowed = await evaluateServicePolicy({
      pageId: "page_1",
      subjectKey: "user:vip",
      actionKey: "payout.request",
      resourceType: "payout",
      context: { riskLevel: "high" },
    });
    expect(allowed.decision).toBe("allow");
    expect(allowed.activeOverrideKeys).toContain("vip-override");
  });

  it("uses approval requests to move from review to allow", async () => {
    await upsertServicePolicyRule({
      pageId: "page_1",
      key: "review-expensive",
      name: "Review expensive transfer",
      effect: "review",
      actionKey: "transfer.create",
      resourceType: "transfer",
      conditions: { amount: { min: 100000 } },
    });

    const first = await evaluateServicePolicy({
      pageId: "page_1",
      subjectKey: "user:1",
      actionKey: "transfer.create",
      resourceType: "transfer",
      context: { amount: 200000 },
    });
    expect(first.decision).toBe("review");

    const request = await createServiceApprovalRequest({
      pageId: "page_1",
      actionKey: "transfer.create",
      resourceType: "transfer",
      subjectKey: "user:1",
      requestedByUserId: "owner_1",
    });
    const pending = await evaluateServicePolicy({
      pageId: "page_1",
      subjectKey: "user:1",
      actionKey: "transfer.create",
      resourceType: "transfer",
      context: { amount: 200000 },
    });
    expect(pending.approvalRequestId).toBe(request.id);
    expect(pending.requiresApproval).toBe(true);

    await decideServiceApprovalRequest({
      pageId: "page_1",
      requestId: request.id,
      status: "approved",
      decidedByUserId: "owner_1",
    });

    const approved = await evaluateServicePolicy({
      pageId: "page_1",
      subjectKey: "user:1",
      actionKey: "transfer.create",
      resourceType: "transfer",
      context: { amount: 200000 },
    });
    expect(approved.decision).toBe("allow");
    expect(approved.reasons).toContain("approval:approved");
  });

  it("aggregates risk score and blocks with sanctions", async () => {
    const incident = await recordServiceRiskIncident({
      pageId: "page_1",
      key: "incident-1",
      subjectKey: "user:risky",
      category: "abuse",
      sourceType: "security",
      score: 55,
    });

    await upsertServiceRiskSanction({
      pageId: "page_1",
      key: "sanction-1",
      subjectKey: "user:risky",
      sanctionType: "block",
      incidentId: incident.id,
      reason: "abuse threshold",
    });

    const evaluation = await evaluateServicePolicy({
      pageId: "page_1",
      subjectKey: "user:risky",
      actionKey: "listing.publish",
      resourceType: "listing",
      context: {},
    });

    expect(evaluation.blocked).toBe(true);
    expect(evaluation.riskScore).toBe(55);
    expect(evaluation.activeSanctionKeys).toContain("sanction-1");
  });

  it("keeps review sanctions above allow rules", async () => {
    await upsertServicePolicyRule({
      pageId: "page_1",
      key: "allow-default",
      name: "Allow default listing edit",
      effect: "allow",
      actionKey: "listing.edit",
      resourceType: "listing",
    });

    await upsertServiceRiskSanction({
      pageId: "page_1",
      key: "review-1",
      subjectKey: "user:watch",
      sanctionType: "review",
      actionKey: "listing.edit",
      resourceType: "listing",
    });

    const evaluation = await evaluateServicePolicy({
      pageId: "page_1",
      subjectKey: "user:watch",
      actionKey: "listing.edit",
      resourceType: "listing",
      context: {},
    });

    expect(evaluation.decision).toBe("review");
    expect(evaluation.reasons).toContain("sanction:review");
  });
});
