import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

export type ServiceBillingScopeType = "page" | "org" | "team" | "user" | "app_user" | "custom";
export type ServiceBillingChargeModel = "subscription" | "one_time" | "usage";
export type ServiceBillingInterval = "once" | "month" | "year";
export type ServiceBillingProvider = "mock" | "stripe";

const billingPrisma = prisma as unknown as {
  serviceBillingAccount: Prisma.ServiceBillingAccountDelegate;
  serviceBillingPlan: Prisma.ServiceBillingPlanDelegate;
  serviceBillingSubscription: Prisma.ServiceBillingSubscriptionDelegate;
  serviceBillingUsageRecord: Prisma.ServiceBillingUsageRecordDelegate;
  serviceBillingCharge: Prisma.ServiceBillingChargeDelegate;
  serviceBillingInvoice: Prisma.ServiceBillingInvoiceDelegate;
  serviceBillingInvoiceLine: Prisma.ServiceBillingInvoiceLineDelegate;
  serviceBillingSettlement: Prisma.ServiceBillingSettlementDelegate;
};

function normalizeCurrency(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "KRW";
  return raw.slice(0, 8);
}

function normalizeProvider(value: unknown): ServiceBillingProvider {
  return value === "stripe" ? "stripe" : "mock";
}

function normalizeChargeModel(value: unknown): ServiceBillingChargeModel {
  if (value === "subscription" || value === "usage") return value;
  return "one_time";
}

function normalizeInterval(value: unknown): ServiceBillingInterval {
  if (value === "month" || value === "year") return value;
  return "once";
}

function normalizeScopeType(value: unknown): ServiceBillingScopeType {
  if (value === "page" || value === "org" || value === "team" || value === "user" || value === "app_user") return value;
  return "custom";
}

function normalizeBps(value: unknown) {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(10000, Math.round(num)));
}

function normalizeFloat(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeInt(value: unknown, fallback = 0) {
  return Math.round(normalizeFloat(value, fallback));
}

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function computeTaxCents(subtotalCents: number, taxRateBasisPoints: number) {
  return Math.round(subtotalCents * (taxRateBasisPoints / 10000));
}

function addInterval(date: Date, interval: ServiceBillingInterval) {
  const next = new Date(date);
  if (interval === "year") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
  }
  if (interval === "month") {
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }
  return next;
}

function makeInvoiceNumber(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const token = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `INV-${y}${m}${d}-${token}`;
}

function resolveSettlementRecipient(account: {
  scope_type: string;
  scope_key: string;
  org_id: string | null;
  team_id: string | null;
}) {
  if (account.scope_type === "org" && account.org_id) {
    return { recipientType: "org", recipientKey: account.org_id };
  }
  if (account.scope_type === "team" && account.team_id) {
    return { recipientType: "team", recipientKey: account.team_id };
  }
  if (account.scope_type === "page") {
    return { recipientType: "page", recipientKey: account.scope_key };
  }
  return { recipientType: account.scope_type, recipientKey: account.scope_key };
}

export async function upsertServiceBillingAccount(input: {
  pageId: string;
  scopeType: ServiceBillingScopeType | string;
  scopeKey: string;
  orgId?: string | null;
  teamId?: string | null;
  appUserId?: string | null;
  customerName?: string | null;
  email?: string | null;
  currency?: string | null;
  providerCustomerRef?: string | null;
  metadata?: unknown;
}) {
  const scopeType = normalizeScopeType(input.scopeType);
  const scopeKey = String(input.scopeKey || "").trim();
  if (!scopeKey) throw new Error("service_billing_scope_key_required");
  return billingPrisma.serviceBillingAccount.upsert({
    where: {
      page_id_scope_type_scope_key: {
        page_id: input.pageId,
        scope_type: scopeType,
        scope_key: scopeKey,
      },
    },
    update: {
      org_id: input.orgId ?? null,
      team_id: input.teamId ?? null,
      app_user_id: input.appUserId ?? null,
      customer_name: input.customerName ?? null,
      email: input.email ?? null,
      currency: normalizeCurrency(input.currency),
      provider_customer_ref: input.providerCustomerRef ?? null,
      metadata: asJson(input.metadata),
    },
    create: {
      page_id: input.pageId,
      scope_type: scopeType,
      scope_key: scopeKey,
      org_id: input.orgId ?? null,
      team_id: input.teamId ?? null,
      app_user_id: input.appUserId ?? null,
      customer_name: input.customerName ?? null,
      email: input.email ?? null,
      currency: normalizeCurrency(input.currency),
      provider_customer_ref: input.providerCustomerRef ?? null,
      metadata: asJson(input.metadata),
    },
  });
}

export async function upsertServiceBillingPlan(input: {
  pageId: string;
  key: string;
  name: string;
  chargeModel?: ServiceBillingChargeModel | string;
  billingInterval?: ServiceBillingInterval | string;
  unitAmountCents: number;
  currency?: string | null;
  usageMetric?: string | null;
  includedUnits?: number | null;
  taxRateBasisPoints?: number | null;
  platformFeeBasisPoints?: number | null;
  provider?: ServiceBillingProvider | string;
  providerPriceRef?: string | null;
  active?: boolean;
  metadata?: unknown;
}) {
  const key = String(input.key || "").trim();
  if (!key) throw new Error("service_billing_plan_key_required");
  const chargeModel = normalizeChargeModel(input.chargeModel);
  const billingInterval = chargeModel === "subscription" ? normalizeInterval(input.billingInterval ?? "month") : chargeModel === "usage" ? "month" : "once";
  return billingPrisma.serviceBillingPlan.upsert({
    where: { page_id_key: { page_id: input.pageId, key } },
    update: {
      name: input.name,
      charge_model: chargeModel,
      billing_interval: billingInterval,
      unit_amount_cents: normalizeInt(input.unitAmountCents),
      currency: normalizeCurrency(input.currency),
      usage_metric: input.usageMetric ?? null,
      included_units: normalizeFloat(input.includedUnits, 0),
      tax_rate_basis_points: normalizeBps(input.taxRateBasisPoints),
      platform_fee_basis_points: normalizeBps(input.platformFeeBasisPoints),
      provider: normalizeProvider(input.provider),
      provider_price_ref: input.providerPriceRef ?? null,
      active: input.active ?? true,
      metadata: asJson(input.metadata),
    },
    create: {
      page_id: input.pageId,
      key,
      name: input.name,
      charge_model: chargeModel,
      billing_interval: billingInterval,
      unit_amount_cents: normalizeInt(input.unitAmountCents),
      currency: normalizeCurrency(input.currency),
      usage_metric: input.usageMetric ?? null,
      included_units: normalizeFloat(input.includedUnits, 0),
      tax_rate_basis_points: normalizeBps(input.taxRateBasisPoints),
      platform_fee_basis_points: normalizeBps(input.platformFeeBasisPoints),
      provider: normalizeProvider(input.provider),
      provider_price_ref: input.providerPriceRef ?? null,
      active: input.active ?? true,
      metadata: asJson(input.metadata),
    },
  });
}

export async function listServiceBillingState(pageId: string) {
  const [accounts, plans, subscriptions, invoices, settlements] = await Promise.all([
    billingPrisma.serviceBillingAccount.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
    billingPrisma.serviceBillingPlan.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
    billingPrisma.serviceBillingSubscription.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
    billingPrisma.serviceBillingInvoice.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" }, include: { lines: true } }),
    billingPrisma.serviceBillingSettlement.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
  ]);
  return { accounts, plans, subscriptions, invoices, settlements };
}

export async function startServiceBillingSubscription(input: {
  pageId: string;
  accountId: string;
  planId: string;
  quantity?: number | null;
  metadata?: unknown;
}) {
  const [account, plan] = await Promise.all([
    billingPrisma.serviceBillingAccount.findFirst({ where: { id: input.accountId, page_id: input.pageId } }),
    billingPrisma.serviceBillingPlan.findFirst({ where: { id: input.planId, page_id: input.pageId, active: true } }),
  ]);
  if (!account) throw new Error("service_billing_account_not_found");
  if (!plan) throw new Error("service_billing_plan_not_found");
  if (plan.charge_model !== "subscription") throw new Error("service_billing_plan_not_subscription");

  const now = new Date();
  return billingPrisma.serviceBillingSubscription.create({
    data: {
      page_id: input.pageId,
      account_id: account.id,
      plan_id: plan.id,
      status: "active",
      quantity: Math.max(1, normalizeInt(input.quantity, 1)),
      current_period_start: now,
      current_period_end: addInterval(now, normalizeInterval(plan.billing_interval)),
      provider: normalizeProvider(plan.provider),
      metadata: asJson(input.metadata),
    },
  });
}

export async function cancelServiceBillingSubscription(input: {
  pageId: string;
  subscriptionId: string;
  cancelAtPeriodEnd?: boolean;
}) {
  const subscription = await billingPrisma.serviceBillingSubscription.findFirst({
    where: { id: input.subscriptionId, page_id: input.pageId },
  });
  if (!subscription) throw new Error("service_billing_subscription_not_found");
  return billingPrisma.serviceBillingSubscription.update({
    where: { id: subscription.id },
    data: {
      status: input.cancelAtPeriodEnd ? subscription.status : "canceled",
      cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
      current_period_end: input.cancelAtPeriodEnd ? subscription.current_period_end : new Date(),
    },
  });
}

export async function recordServiceBillingUsage(input: {
  pageId: string;
  accountId: string;
  planId: string;
  metric: string;
  quantity: number;
  windowStart: string | Date;
  windowEnd: string | Date;
  idempotencyKey: string;
  metadata?: unknown;
}) {
  const [account, plan] = await Promise.all([
    billingPrisma.serviceBillingAccount.findFirst({ where: { id: input.accountId, page_id: input.pageId } }),
    billingPrisma.serviceBillingPlan.findFirst({ where: { id: input.planId, page_id: input.pageId, active: true } }),
  ]);
  if (!account) throw new Error("service_billing_account_not_found");
  if (!plan) throw new Error("service_billing_plan_not_found");
  if (plan.charge_model !== "usage") throw new Error("service_billing_plan_not_usage");
  if (plan.usage_metric && plan.usage_metric !== input.metric) throw new Error("service_billing_metric_mismatch");

  const existing = await billingPrisma.serviceBillingUsageRecord.findUnique({
    where: {
      page_id_idempotency_key: {
        page_id: input.pageId,
        idempotency_key: input.idempotencyKey,
      },
    },
  });
  if (existing) return existing;

  return billingPrisma.serviceBillingUsageRecord.create({
    data: {
      page_id: input.pageId,
      account_id: account.id,
      plan_id: plan.id,
      metric: input.metric,
      quantity: normalizeFloat(input.quantity, 0),
      window_start: new Date(input.windowStart),
      window_end: new Date(input.windowEnd),
      idempotency_key: input.idempotencyKey,
      metadata: asJson(input.metadata),
    },
  });
}

export async function createServiceBillingCharge(input: {
  pageId: string;
  accountId: string;
  description: string;
  quantity?: number | null;
  unitAmountCents: number;
  currency?: string | null;
  kind?: string | null;
  planId?: string | null;
  taxRateBasisPoints?: number | null;
  platformFeeBasisPoints?: number | null;
  externalRef?: string | null;
  metadata?: unknown;
}) {
  const account = await billingPrisma.serviceBillingAccount.findFirst({
    where: { id: input.accountId, page_id: input.pageId },
  });
  if (!account) throw new Error("service_billing_account_not_found");
  const plan = input.planId
    ? await billingPrisma.serviceBillingPlan.findFirst({ where: { id: input.planId, page_id: input.pageId } })
    : null;
  if (input.planId && !plan) throw new Error("service_billing_plan_not_found");

  const quantity = Math.max(1, normalizeFloat(input.quantity, 1));
  const unitAmountCents = normalizeInt(input.unitAmountCents, 0);
  const subtotalCents = Math.round(quantity * unitAmountCents);
  const taxRateBasisPoints = normalizeBps(input.taxRateBasisPoints ?? plan?.tax_rate_basis_points ?? 0);
  const platformFeeBasisPoints = normalizeBps(input.platformFeeBasisPoints ?? plan?.platform_fee_basis_points ?? 0);
  const taxCents = computeTaxCents(subtotalCents, taxRateBasisPoints);
  const totalCents = subtotalCents + taxCents;

  return billingPrisma.serviceBillingCharge.create({
    data: {
      page_id: input.pageId,
      account_id: account.id,
      plan_id: plan?.id ?? null,
      kind: input.kind ?? "one_time",
      status: "pending",
      description: input.description,
      quantity,
      unit_amount_cents: unitAmountCents,
      subtotal_cents: subtotalCents,
      tax_rate_basis_points: taxRateBasisPoints,
      platform_fee_basis_points: platformFeeBasisPoints,
      tax_cents: taxCents,
      total_cents: totalCents,
      currency: normalizeCurrency(input.currency ?? plan?.currency ?? account.currency),
      external_ref: input.externalRef ?? null,
      metadata: asJson(input.metadata),
    },
  });
}

export async function generateServiceBillingInvoice(input: {
  pageId: string;
  accountId: string;
  dueAt?: string | Date | null;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  metadata?: unknown;
}) {
  const account = await billingPrisma.serviceBillingAccount.findFirst({
    where: { id: input.accountId, page_id: input.pageId },
  });
  if (!account) throw new Error("service_billing_account_not_found");

  const [subscriptions, usageRecords, charges] = await Promise.all([
    billingPrisma.serviceBillingSubscription.findMany({
      where: { page_id: input.pageId, account_id: input.accountId, status: "active" },
      include: { plan: true },
    }),
    billingPrisma.serviceBillingUsageRecord.findMany({
      where: { page_id: input.pageId, account_id: input.accountId, invoiced_at: null },
      include: { plan: true },
      orderBy: { created_at: "asc" },
    }),
    billingPrisma.serviceBillingCharge.findMany({
      where: { page_id: input.pageId, account_id: input.accountId, invoiced_at: null },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const invoiceNumber = makeInvoiceNumber();
  const lineInputs: Array<{
    kind: string;
    description: string;
    quantity: number;
    unitAmountCents: number;
    amountCents: number;
    currency: string;
    planId?: string | null;
    subscriptionId?: string | null;
    usageRecordId?: string | null;
    chargeId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }> = [];

  let subtotalCents = 0;
  let taxCents = 0;
  let adjustmentCents = 0;

  for (const subscription of subscriptions) {
    const amountCents = Math.max(subscription.quantity, 1) * subscription.plan.unit_amount_cents;
    subtotalCents += amountCents;
    const subscriptionTax = computeTaxCents(amountCents, subscription.plan.tax_rate_basis_points);
    taxCents += subscriptionTax;
    lineInputs.push({
      kind: "subscription",
      description: `${subscription.plan.name} 구독`,
      quantity: subscription.quantity,
      unitAmountCents: subscription.plan.unit_amount_cents,
      amountCents,
      currency: subscription.plan.currency,
      planId: subscription.plan_id,
      subscriptionId: subscription.id,
      metadata: asJson({ interval: subscription.plan.billing_interval }),
    });
    if (subscriptionTax > 0) {
      lineInputs.push({
        kind: "tax",
        description: `${subscription.plan.name} 세금`,
        quantity: 1,
        unitAmountCents: subscriptionTax,
        amountCents: subscriptionTax,
        currency: subscription.plan.currency,
        planId: subscription.plan_id,
      });
    }
  }

  for (const usageRecord of usageRecords) {
    const billableQuantity = Math.max(usageRecord.quantity - usageRecord.plan.included_units, 0);
    if (billableQuantity <= 0) continue;
    const amountCents = Math.round(billableQuantity * usageRecord.plan.unit_amount_cents);
    subtotalCents += amountCents;
    const usageTax = computeTaxCents(amountCents, usageRecord.plan.tax_rate_basis_points);
    taxCents += usageTax;
    lineInputs.push({
      kind: "usage",
      description: `${usageRecord.plan.name} 사용량`,
      quantity: billableQuantity,
      unitAmountCents: usageRecord.plan.unit_amount_cents,
      amountCents,
      currency: usageRecord.plan.currency,
      planId: usageRecord.plan_id,
      usageRecordId: usageRecord.id,
      metadata: asJson({ metric: usageRecord.metric, windowStart: usageRecord.window_start, windowEnd: usageRecord.window_end }),
    });
    if (usageTax > 0) {
      lineInputs.push({
        kind: "tax",
        description: `${usageRecord.plan.name} 세금`,
        quantity: 1,
        unitAmountCents: usageTax,
        amountCents: usageTax,
        currency: usageRecord.plan.currency,
        planId: usageRecord.plan_id,
      });
    }
  }

  for (const charge of charges) {
    subtotalCents += charge.subtotal_cents;
    taxCents += charge.tax_cents;
    if (charge.kind === "adjustment") adjustmentCents += charge.subtotal_cents;
    lineInputs.push({
      kind: charge.kind,
      description: charge.description,
      quantity: charge.quantity,
      unitAmountCents: charge.unit_amount_cents,
      amountCents: charge.subtotal_cents,
      currency: charge.currency,
      planId: charge.plan_id,
      chargeId: charge.id,
      metadata: asJson({ externalRef: charge.external_ref }),
    });
    if (charge.tax_cents > 0) {
      lineInputs.push({
        kind: "tax",
        description: `${charge.description} 세금`,
        quantity: 1,
        unitAmountCents: charge.tax_cents,
        amountCents: charge.tax_cents,
        currency: charge.currency,
        chargeId: charge.id,
      });
    }
  }

  const invoice = await billingPrisma.serviceBillingInvoice.create({
    data: {
      page_id: input.pageId,
      account_id: account.id,
      number: invoiceNumber,
      status: "open",
      currency: account.currency,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      adjustment_cents: adjustmentCents,
      total_cents: subtotalCents + taxCents,
      amount_paid_cents: 0,
      due_at: input.dueAt ? new Date(input.dueAt) : null,
      period_start: input.periodStart ? new Date(input.periodStart) : null,
      period_end: input.periodEnd ? new Date(input.periodEnd) : null,
      metadata: asJson(input.metadata),
    },
  });

  for (const line of lineInputs) {
    await billingPrisma.serviceBillingInvoiceLine.create({
      data: {
        page_id: input.pageId,
        invoice_id: invoice.id,
        plan_id: line.planId ?? null,
        subscription_id: line.subscriptionId ?? null,
        usage_record_id: line.usageRecordId ?? null,
        charge_id: line.chargeId ?? null,
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unit_amount_cents: line.unitAmountCents,
        amount_cents: line.amountCents,
        currency: line.currency,
        metadata: line.metadata,
      },
    });
  }

  const now = new Date();
  if (usageRecords.length) {
    await billingPrisma.serviceBillingUsageRecord.updateMany({
      where: { id: { in: usageRecords.map((record: { id: string }) => record.id) } },
      data: { invoiced_at: now },
    });
  }
  if (charges.length) {
    await billingPrisma.serviceBillingCharge.updateMany({
      where: { id: { in: charges.map((charge: { id: string }) => charge.id) } },
      data: { invoiced_at: now, status: "invoiced" },
    });
  }

  return billingPrisma.serviceBillingInvoice.findUnique({
    where: { id: invoice.id },
    include: { lines: true },
  });
}

export async function markServiceBillingInvoicePaid(input: {
  pageId: string;
  invoiceId: string;
  amountPaidCents?: number | null;
  externalRef?: string | null;
  metadata?: unknown;
}) {
  const invoice = await billingPrisma.serviceBillingInvoice.findFirst({
    where: { id: input.invoiceId, page_id: input.pageId },
    include: { lines: true },
  });
  if (!invoice) throw new Error("service_billing_invoice_not_found");
  const amountPaidCents = input.amountPaidCents == null ? invoice.total_cents : normalizeInt(input.amountPaidCents, invoice.total_cents);
  const updated = await billingPrisma.serviceBillingInvoice.update({
    where: { id: invoice.id },
    data: {
      status: amountPaidCents >= invoice.total_cents ? "paid" : "open",
      amount_paid_cents: amountPaidCents,
      paid_at: amountPaidCents >= invoice.total_cents ? new Date() : null,
      external_ref: input.externalRef ?? invoice.external_ref,
      metadata: asJson(input.metadata ?? invoice.metadata ?? undefined),
    },
  });
  const chargeIds = invoice.lines.map((line: { charge_id: string | null }) => line.charge_id).filter((value: string | null): value is string => Boolean(value));
  if (chargeIds.length && amountPaidCents > 0) {
    await billingPrisma.serviceBillingCharge.updateMany({
      where: { id: { in: chargeIds } },
      data: { status: "paid" },
    });
  }
  return updated;
}

export async function runServiceBillingSettlement(input: {
  pageId: string;
  invoiceId: string;
  metadata?: unknown;
}) {
  const invoice = await billingPrisma.serviceBillingInvoice.findFirst({
    where: { id: input.invoiceId, page_id: input.pageId },
    include: {
      account: true,
      lines: {
        include: {
          plan: true,
          charge: true,
        },
      },
    },
  });
  if (!invoice) throw new Error("service_billing_invoice_not_found");

  let feeCents = 0;
  for (const line of invoice.lines) {
    if (line.kind === "tax") continue;
    const feeBasisPoints =
      line.plan?.platform_fee_basis_points ??
      line.charge?.platform_fee_basis_points ??
      0;
    feeCents += Math.round(line.amount_cents * (feeBasisPoints / 10000));
  }

  const { recipientType, recipientKey } = resolveSettlementRecipient(invoice.account);
  return billingPrisma.serviceBillingSettlement.create({
    data: {
      page_id: input.pageId,
      account_id: invoice.account_id,
      invoice_id: invoice.id,
      recipient_type: recipientType,
      recipient_key: recipientKey,
      currency: invoice.currency,
      gross_cents: invoice.total_cents,
      fee_cents: feeCents,
      net_cents: Math.max(invoice.total_cents - feeCents, 0),
      status: "settled",
      settled_at: new Date(),
      metadata: asJson(input.metadata),
    },
  });
}
