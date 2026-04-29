import { beforeEach, describe, expect, it, vi } from "vitest";

type AccountRow = {
  id: string;
  page_id: string;
  scope_type: string;
  scope_key: string;
  org_id: string | null;
  team_id: string | null;
  app_user_id: string | null;
  customer_name: string | null;
  email: string | null;
  currency: string;
  provider_customer_ref: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type PlanRow = {
  id: string;
  page_id: string;
  key: string;
  name: string;
  charge_model: string;
  billing_interval: string;
  unit_amount_cents: number;
  currency: string;
  usage_metric: string | null;
  included_units: number;
  tax_rate_basis_points: number;
  platform_fee_basis_points: number;
  provider: string;
  provider_price_ref: string | null;
  active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type SubscriptionRow = {
  id: string;
  page_id: string;
  account_id: string;
  plan_id: string;
  status: string;
  quantity: number;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  provider: string;
  provider_ref: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type UsageRow = {
  id: string;
  page_id: string;
  account_id: string;
  plan_id: string;
  metric: string;
  quantity: number;
  window_start: Date;
  window_end: Date;
  idempotency_key: string;
  metadata: Record<string, unknown> | null;
  invoiced_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ChargeRow = {
  id: string;
  page_id: string;
  account_id: string;
  plan_id: string | null;
  kind: string;
  status: string;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  subtotal_cents: number;
  tax_rate_basis_points: number;
  platform_fee_basis_points: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  external_ref: string | null;
  metadata: Record<string, unknown> | null;
  invoiced_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type InvoiceRow = {
  id: string;
  page_id: string;
  account_id: string;
  number: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  adjustment_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  due_at: Date | null;
  paid_at: Date | null;
  period_start: Date | null;
  period_end: Date | null;
  external_ref: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type InvoiceLineRow = {
  id: string;
  page_id: string;
  invoice_id: string;
  plan_id: string | null;
  subscription_id: string | null;
  usage_record_id: string | null;
  charge_id: string | null;
  kind: string;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  amount_cents: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type SettlementRow = {
  id: string;
  page_id: string;
  account_id: string;
  invoice_id: string;
  recipient_type: string;
  recipient_key: string;
  currency: string;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  status: string;
  settled_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

const state = vi.hoisted(() => ({
  seq: 0,
  accounts: [] as AccountRow[],
  plans: [] as PlanRow[],
  subscriptions: [] as SubscriptionRow[],
  usages: [] as UsageRow[],
  charges: [] as ChargeRow[],
  invoices: [] as InvoiceRow[],
  lines: [] as InvoiceLineRow[],
  settlements: [] as SettlementRow[],
}));

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const prismaMock = vi.hoisted(() => ({
  serviceBillingAccount: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_scope_type_scope_key;
      let row = state.accounts.find(
        (item) => item.page_id === key.page_id && item.scope_type === key.scope_type && item.scope_key === key.scope_key,
      );
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("acct"),
        page_id: String(create.page_id),
        scope_type: String(create.scope_type),
        scope_key: String(create.scope_key),
        org_id: (create.org_id as string | null) ?? null,
        team_id: (create.team_id as string | null) ?? null,
        app_user_id: (create.app_user_id as string | null) ?? null,
        customer_name: (create.customer_name as string | null) ?? null,
        email: (create.email as string | null) ?? null,
        currency: String(create.currency),
        provider_customer_ref: (create.provider_customer_ref as string | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.accounts.push(row);
      return clone(row);
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return clone(
        state.accounts.find((item) => item.id === where.id && item.page_id === where.page_id) ?? null,
      );
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.accounts.filter((item) => item.page_id === where.page_id);
      if (orderBy?.created_at === "desc") rows = rows.slice().reverse();
      return clone(rows);
    }),
  },
  serviceBillingPlan: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.plans.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("plan"),
        page_id: String(create.page_id),
        key: String(create.key),
        name: String(create.name),
        charge_model: String(create.charge_model),
        billing_interval: String(create.billing_interval),
        unit_amount_cents: Number(create.unit_amount_cents),
        currency: String(create.currency),
        usage_metric: (create.usage_metric as string | null) ?? null,
        included_units: Number(create.included_units ?? 0),
        tax_rate_basis_points: Number(create.tax_rate_basis_points ?? 0),
        platform_fee_basis_points: Number(create.platform_fee_basis_points ?? 0),
        provider: String(create.provider ?? "mock"),
        provider_price_ref: (create.provider_price_ref as string | null) ?? null,
        active: Boolean(create.active ?? true),
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.plans.push(row);
      return clone(row);
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return clone(
        state.plans.find(
          (item) =>
            item.id === where.id &&
            item.page_id === where.page_id &&
            (where.active === undefined || item.active === where.active),
        ) ?? null,
      );
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.plans.filter((item) => item.page_id === where.page_id);
      if (orderBy?.created_at === "desc") rows = rows.slice().reverse();
      return clone(rows);
    }),
  },
  serviceBillingSubscription: {
    create: vi.fn(async ({ data }: any) => {
      const row: SubscriptionRow = {
        id: nextId("sub"),
        page_id: String(data.page_id),
        account_id: String(data.account_id),
        plan_id: String(data.plan_id),
        status: String(data.status),
        quantity: Number(data.quantity),
        current_period_start: (data.current_period_start as Date | null) ?? null,
        current_period_end: (data.current_period_end as Date | null) ?? null,
        cancel_at_period_end: Boolean(data.cancel_at_period_end ?? false),
        provider: String(data.provider ?? "mock"),
        provider_ref: (data.provider_ref as string | null) ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.subscriptions.push(row);
      return clone(row);
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return clone(
        state.subscriptions.find((item) => item.id === where.id && item.page_id === where.page_id) ?? null,
      );
    }),
    findMany: vi.fn(async ({ where, include, orderBy }: any) => {
      let rows = state.subscriptions.filter(
        (item) =>
          item.page_id === where.page_id &&
          (where.account_id === undefined || item.account_id === where.account_id) &&
          (where.status === undefined || item.status === where.status),
      );
      if (orderBy?.created_at === "desc") rows = rows.slice().reverse();
      if (!include?.plan) return clone(rows);
      return clone(
        rows.map((row) => ({
          ...row,
          plan: state.plans.find((plan) => plan.id === row.plan_id)!,
        })),
      );
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.subscriptions.find((item) => item.id === where.id);
      if (!row) throw new Error("subscription_not_found");
      Object.assign(row, data, { updated_at: new Date() });
      return clone(row);
    }),
  },
  serviceBillingUsageRecord: {
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where.page_id_idempotency_key;
      return clone(
        state.usages.find((item) => item.page_id === key.page_id && item.idempotency_key === key.idempotency_key) ?? null,
      );
    }),
    create: vi.fn(async ({ data }: any) => {
      const row: UsageRow = {
        id: nextId("usage"),
        page_id: String(data.page_id),
        account_id: String(data.account_id),
        plan_id: String(data.plan_id),
        metric: String(data.metric),
        quantity: Number(data.quantity),
        window_start: new Date(data.window_start),
        window_end: new Date(data.window_end),
        idempotency_key: String(data.idempotency_key),
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        invoiced_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.usages.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, include }: any) => {
      const rows = state.usages.filter(
        (item) =>
          item.page_id === where.page_id &&
          item.account_id === where.account_id &&
          (where.invoiced_at === undefined ? true : item.invoiced_at === where.invoiced_at),
      );
      if (!include?.plan) return clone(rows);
      return clone(rows.map((row) => ({ ...row, plan: state.plans.find((plan) => plan.id === row.plan_id)! })));
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0;
      const ids = new Set(where.id.in as string[]);
      for (const row of state.usages) {
        if (!ids.has(row.id)) continue;
        Object.assign(row, data, { updated_at: new Date() });
        count += 1;
      }
      return { count };
    }),
  },
  serviceBillingCharge: {
    create: vi.fn(async ({ data }: any) => {
      const row: ChargeRow = {
        id: nextId("charge"),
        page_id: String(data.page_id),
        account_id: String(data.account_id),
        plan_id: (data.plan_id as string | null) ?? null,
        kind: String(data.kind),
        status: String(data.status),
        description: String(data.description),
        quantity: Number(data.quantity),
        unit_amount_cents: Number(data.unit_amount_cents),
        subtotal_cents: Number(data.subtotal_cents),
        tax_rate_basis_points: Number(data.tax_rate_basis_points),
        platform_fee_basis_points: Number(data.platform_fee_basis_points),
        tax_cents: Number(data.tax_cents),
        total_cents: Number(data.total_cents),
        currency: String(data.currency),
        external_ref: (data.external_ref as string | null) ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        invoiced_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.charges.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.charges.filter(
        (item) =>
          item.page_id === where.page_id &&
          item.account_id === where.account_id &&
          (where.invoiced_at === undefined ? true : item.invoiced_at === where.invoiced_at),
      );
      if (orderBy?.created_at === "asc") rows = rows.slice();
      return clone(rows);
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0;
      const ids = new Set(where.id.in as string[]);
      for (const row of state.charges) {
        if (!ids.has(row.id)) continue;
        Object.assign(row, data, { updated_at: new Date() });
        count += 1;
      }
      return { count };
    }),
  },
  serviceBillingInvoice: {
    create: vi.fn(async ({ data }: any) => {
      const row: InvoiceRow = {
        id: nextId("invoice"),
        page_id: String(data.page_id),
        account_id: String(data.account_id),
        number: String(data.number),
        status: String(data.status),
        currency: String(data.currency),
        subtotal_cents: Number(data.subtotal_cents),
        tax_cents: Number(data.tax_cents),
        adjustment_cents: Number(data.adjustment_cents),
        total_cents: Number(data.total_cents),
        amount_paid_cents: Number(data.amount_paid_cents),
        due_at: (data.due_at as Date | null) ?? null,
        paid_at: (data.paid_at as Date | null) ?? null,
        period_start: (data.period_start as Date | null) ?? null,
        period_end: (data.period_end as Date | null) ?? null,
        external_ref: (data.external_ref as string | null) ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.invoices.push(row);
      return clone(row);
    }),
    findUnique: vi.fn(async ({ where, include }: any) => {
      const row = state.invoices.find((item) => item.id === where.id);
      if (!row) return null;
      if (!include?.lines) return clone(row);
      return clone({
        ...row,
        lines: state.lines.filter((line) => line.invoice_id === row.id),
      });
    }),
    findFirst: vi.fn(async ({ where, include }: any) => {
      const row = state.invoices.find((item) => item.id === where.id && item.page_id === where.page_id);
      if (!row) return null;
      if (!include) return clone(row);
      return clone({
        ...row,
        lines: state.lines
          .filter((line) => line.invoice_id === row.id)
          .map((line) => ({
            ...line,
            plan: line.plan_id ? state.plans.find((plan) => plan.id === line.plan_id) ?? null : null,
            charge: line.charge_id ? state.charges.find((charge) => charge.id === line.charge_id) ?? null : null,
          })),
        account: state.accounts.find((account) => account.id === row.account_id)!,
      });
    }),
    findMany: vi.fn(async ({ where, include, orderBy }: any) => {
      let rows = state.invoices.filter((item) => item.page_id === where.page_id);
      if (orderBy?.created_at === "desc") rows = rows.slice().reverse();
      if (!include?.lines) return clone(rows);
      return clone(
        rows.map((row) => ({
          ...row,
          lines: state.lines.filter((line) => line.invoice_id === row.id),
        })),
      );
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.invoices.find((item) => item.id === where.id);
      if (!row) throw new Error("invoice_not_found");
      Object.assign(row, data, { updated_at: new Date() });
      return clone(row);
    }),
  },
  serviceBillingInvoiceLine: {
    create: vi.fn(async ({ data }: any) => {
      const row: InvoiceLineRow = {
        id: nextId("line"),
        page_id: String(data.page_id),
        invoice_id: String(data.invoice_id),
        plan_id: (data.plan_id as string | null) ?? null,
        subscription_id: (data.subscription_id as string | null) ?? null,
        usage_record_id: (data.usage_record_id as string | null) ?? null,
        charge_id: (data.charge_id as string | null) ?? null,
        kind: String(data.kind),
        description: String(data.description),
        quantity: Number(data.quantity),
        unit_amount_cents: Number(data.unit_amount_cents),
        amount_cents: Number(data.amount_cents),
        currency: String(data.currency),
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.lines.push(row);
      return clone(row);
    }),
  },
  serviceBillingSettlement: {
    create: vi.fn(async ({ data }: any) => {
      const row: SettlementRow = {
        id: nextId("settle"),
        page_id: String(data.page_id),
        account_id: String(data.account_id),
        invoice_id: String(data.invoice_id),
        recipient_type: String(data.recipient_type),
        recipient_key: String(data.recipient_key),
        currency: String(data.currency),
        gross_cents: Number(data.gross_cents),
        fee_cents: Number(data.fee_cents),
        net_cents: Number(data.net_cents),
        status: String(data.status),
        settled_at: (data.settled_at as Date | null) ?? null,
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.settlements.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.settlements.filter((item) => item.page_id === where.page_id);
      if (orderBy?.created_at === "desc") rows = rows.slice().reverse();
      return clone(rows);
    }),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  cancelServiceBillingSubscription,
  createServiceBillingCharge,
  generateServiceBillingInvoice,
  markServiceBillingInvoicePaid,
  recordServiceBillingUsage,
  runServiceBillingSettlement,
  startServiceBillingSubscription,
  upsertServiceBillingAccount,
  upsertServiceBillingPlan,
} from "@/lib/service-billing";

describe("service billing", () => {
  beforeEach(() => {
    state.seq = 0;
    state.accounts = [];
    state.plans = [];
    state.subscriptions = [];
    state.usages = [];
    state.charges = [];
    state.invoices = [];
    state.lines = [];
    state.settlements = [];
    vi.clearAllMocks();
  });

  it("upserts billing account and plan", async () => {
    const account = await upsertServiceBillingAccount({
      pageId: "page1",
      scopeType: "org",
      scopeKey: "org:alpha",
      orgId: "org_alpha",
      customerName: "Alpha Org",
      currency: "krw",
    });
    const plan = await upsertServiceBillingPlan({
      pageId: "page1",
      key: "pro-monthly",
      name: "Pro",
      chargeModel: "subscription",
      billingInterval: "month",
      unitAmountCents: 19900,
      taxRateBasisPoints: 1000,
      platformFeeBasisPoints: 1500,
    });

    expect(account.scope_type).toBe("org");
    expect(account.currency).toBe("KRW");
    expect(plan.charge_model).toBe("subscription");
    expect(plan.billing_interval).toBe("month");
  });

  it("starts and cancels subscription", async () => {
    const account = await upsertServiceBillingAccount({
      pageId: "page1",
      scopeType: "custom",
      scopeKey: "acct:1",
    });
    const plan = await upsertServiceBillingPlan({
      pageId: "page1",
      key: "starter",
      name: "Starter",
      chargeModel: "subscription",
      billingInterval: "month",
      unitAmountCents: 9900,
    });

    const subscription = await startServiceBillingSubscription({
      pageId: "page1",
      accountId: account.id,
      planId: plan.id,
      quantity: 2,
    });
    expect(subscription.status).toBe("active");
    expect(subscription.quantity).toBe(2);

    const cancelled = await cancelServiceBillingSubscription({
      pageId: "page1",
      subscriptionId: subscription.id,
    });
    expect(cancelled.status).toBe("canceled");
  });

  it("records usage idempotently", async () => {
    const account = await upsertServiceBillingAccount({
      pageId: "page1",
      scopeType: "custom",
      scopeKey: "acct:usage",
    });
    const plan = await upsertServiceBillingPlan({
      pageId: "page1",
      key: "api-usage",
      name: "API Usage",
      chargeModel: "usage",
      unitAmountCents: 10,
      usageMetric: "api_calls",
      includedUnits: 100,
    });

    const first = await recordServiceBillingUsage({
      pageId: "page1",
      accountId: account.id,
      planId: plan.id,
      metric: "api_calls",
      quantity: 150,
      windowStart: "2026-03-01T00:00:00.000Z",
      windowEnd: "2026-03-31T23:59:59.000Z",
      idempotencyKey: "usage-1",
    });
    const second = await recordServiceBillingUsage({
      pageId: "page1",
      accountId: account.id,
      planId: plan.id,
      metric: "api_calls",
      quantity: 150,
      windowStart: "2026-03-01T00:00:00.000Z",
      windowEnd: "2026-03-31T23:59:59.000Z",
      idempotencyKey: "usage-1",
    });

    expect(first.id).toBe(second.id);
    expect(state.usages).toHaveLength(1);
  });

  it("generates invoice from subscriptions, usage, and charges", async () => {
    const account = await upsertServiceBillingAccount({
      pageId: "page1",
      scopeType: "org",
      scopeKey: "org:billing",
      orgId: "org_1",
    });
    const subPlan = await upsertServiceBillingPlan({
      pageId: "page1",
      key: "team-pro",
      name: "Team Pro",
      chargeModel: "subscription",
      billingInterval: "month",
      unitAmountCents: 10000,
      taxRateBasisPoints: 1000,
      platformFeeBasisPoints: 1000,
    });
    const usagePlan = await upsertServiceBillingPlan({
      pageId: "page1",
      key: "api-metered",
      name: "API Metered",
      chargeModel: "usage",
      unitAmountCents: 50,
      usageMetric: "api_calls",
      includedUnits: 10,
      taxRateBasisPoints: 0,
      platformFeeBasisPoints: 500,
    });

    await startServiceBillingSubscription({
      pageId: "page1",
      accountId: account.id,
      planId: subPlan.id,
      quantity: 2,
    });
    await recordServiceBillingUsage({
      pageId: "page1",
      accountId: account.id,
      planId: usagePlan.id,
      metric: "api_calls",
      quantity: 30,
      windowStart: "2026-03-01T00:00:00.000Z",
      windowEnd: "2026-03-31T23:59:59.000Z",
      idempotencyKey: "usage-bill-1",
    });
    await createServiceBillingCharge({
      pageId: "page1",
      accountId: account.id,
      description: "온보딩 비용",
      quantity: 1,
      unitAmountCents: 5000,
      taxRateBasisPoints: 1000,
    });

    const invoice = await generateServiceBillingInvoice({
      pageId: "page1",
      accountId: account.id,
    });

    expect(invoice?.subtotal_cents).toBe(26000);
    expect(invoice?.tax_cents).toBe(2500);
    expect(invoice?.total_cents).toBe(28500);
    expect(invoice?.lines.some((line) => line.kind === "subscription")).toBe(true);
    expect(invoice?.lines.some((line) => line.kind === "usage")).toBe(true);
    expect(invoice?.lines.some((line) => line.kind === "one_time")).toBe(true);
  });

  it("marks invoice paid and creates settlement", async () => {
    const account = await upsertServiceBillingAccount({
      pageId: "page1",
      scopeType: "org",
      scopeKey: "org:settle",
      orgId: "org_settle",
    });
    const plan = await upsertServiceBillingPlan({
      pageId: "page1",
      key: "settle-plan",
      name: "Settle",
      chargeModel: "subscription",
      billingInterval: "month",
      unitAmountCents: 10000,
      platformFeeBasisPoints: 1200,
    });

    const sub = await startServiceBillingSubscription({
      pageId: "page1",
      accountId: account.id,
      planId: plan.id,
      quantity: 1,
    });
    const invoice = await generateServiceBillingInvoice({
      pageId: "page1",
      accountId: account.id,
    });

    const paid = await markServiceBillingInvoicePaid({
      pageId: "page1",
      invoiceId: invoice!.id,
      amountPaidCents: invoice!.total_cents,
      externalRef: "pay_ref_1",
    });
    const settlement = await runServiceBillingSettlement({
      pageId: "page1",
      invoiceId: invoice!.id,
    });

    expect(paid.status).toBe("paid");
    expect(settlement.recipient_type).toBe("org");
    expect(settlement.recipient_key).toBe("org_settle");
    expect(settlement.gross_cents).toBe(invoice!.total_cents);
    expect(settlement.fee_cents).toBe(1200);
    expect(settlement.net_cents).toBe(invoice!.total_cents - 1200);
    expect(state.subscriptions.find((item) => item.id === sub.id)?.status).toBe("active");
  });
});
