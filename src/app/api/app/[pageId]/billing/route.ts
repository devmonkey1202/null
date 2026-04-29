import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import type { AppRole } from "@/lib/app-permissions";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { parseJsonObject } from "@/lib/validation";
import {
  cancelServiceBillingSubscription,
  createServiceBillingCharge,
  generateServiceBillingInvoice,
  listServiceBillingState,
  markServiceBillingInvoicePaid,
  recordServiceBillingUsage,
  runServiceBillingSettlement,
  startServiceBillingSubscription,
  upsertServiceBillingAccount,
  upsertServiceBillingPlan,
} from "@/lib/service-billing";

type Params = { pageId: string };
const OPERATOR_ROLES: AppRole[] = ["admin", "editor"];

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function permissionForAction(action: string) {
  if (
    action === "account.upsert" ||
    action === "plan.upsert" ||
    action === "usage.record" ||
    action === "invoice.generate" ||
    action === "settlement.run"
  ) {
    return { allowedRoles: OPERATOR_ROLES } as const;
  }

  if (action === "subscription.start" || action === "charge.create") {
    return { appAction: "create" as const };
  }

  if (action === "subscription.cancel" || action === "invoice.pay") {
    return { appAction: "update" as const };
  }

  return { appAction: "read" as const };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { allowedRoles: OPERATOR_ROLES });
  if (permissionError) return permissionError;

  const state = await listServiceBillingState(pageId);
  return NextResponse.json({ ok: true, ...state });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const action = typeof body.action === "string" ? body.action : "";
  const permissionError = ensureServiceRoutePermission(gate.access, permissionForAction(action));
  if (permissionError) return permissionError;

  try {
    if (action === "account.upsert") {
      const result = await upsertServiceBillingAccount({
        pageId,
        scopeType: asString(body.scopeType) ?? asString(body.scope_type) ?? "custom",
        scopeKey: asString(body.scopeKey) ?? String(body.scope_key ?? ""),
        orgId: asString(body.orgId) ?? asString(body.org_id) ?? null,
        teamId: asString(body.teamId) ?? asString(body.team_id) ?? null,
        appUserId: asString(body.appUserId) ?? asString(body.app_user_id) ?? null,
        customerName: asString(body.customerName) ?? asString(body.customer_name) ?? null,
        email: asString(body.email) ?? null,
        currency: asString(body.currency) ?? null,
        providerCustomerRef: asString(body.providerCustomerRef) ?? asString(body.provider_customer_ref) ?? null,
        metadata: body.metadata,
      });
      return NextResponse.json({ ok: true, account: result });
    }

    if (action === "plan.upsert") {
      const result = await upsertServiceBillingPlan({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        chargeModel: asString(body.chargeModel) ?? asString(body.charge_model),
        billingInterval: asString(body.billingInterval) ?? asString(body.billing_interval),
        unitAmountCents: Number(body.unitAmountCents ?? body.unit_amount_cents ?? 0),
        currency: asString(body.currency) ?? null,
        usageMetric: asString(body.usageMetric) ?? asString(body.usage_metric) ?? null,
        includedUnits: Number(body.includedUnits ?? body.included_units ?? 0),
        taxRateBasisPoints: Number(body.taxRateBasisPoints ?? body.tax_rate_basis_points ?? 0),
        platformFeeBasisPoints: Number(body.platformFeeBasisPoints ?? body.platform_fee_basis_points ?? 0),
        provider: asString(body.provider),
        providerPriceRef: asString(body.providerPriceRef) ?? asString(body.provider_price_ref) ?? null,
        active: typeof body.active === "boolean" ? body.active : true,
        metadata: body.metadata,
      });
      return NextResponse.json({ ok: true, plan: result });
    }

    if (action === "subscription.start") {
      const subscription = await startServiceBillingSubscription({
        pageId,
        accountId: asString(body.accountId) ?? String(body.account_id ?? ""),
        planId: asString(body.planId) ?? String(body.plan_id ?? ""),
        quantity: Number(body.quantity ?? 1),
        metadata: body.metadata,
      });
      return NextResponse.json({ ok: true, subscription });
    }

    if (action === "subscription.cancel") {
      const subscription = await cancelServiceBillingSubscription({
        pageId,
        subscriptionId: asString(body.subscriptionId) ?? String(body.subscription_id ?? ""),
        cancelAtPeriodEnd: body.cancelAtPeriodEnd === true || body.cancel_at_period_end === true,
      });
      return NextResponse.json({ ok: true, subscription });
    }

    if (action === "usage.record") {
      const usage = await recordServiceBillingUsage({
        pageId,
        accountId: asString(body.accountId) ?? String(body.account_id ?? ""),
        planId: asString(body.planId) ?? String(body.plan_id ?? ""),
        metric: asString(body.metric) ?? "",
        quantity: Number(body.quantity ?? 0),
        windowStart: asString(body.windowStart) ?? String(body.window_start ?? new Date().toISOString()),
        windowEnd: asString(body.windowEnd) ?? String(body.window_end ?? new Date().toISOString()),
        idempotencyKey: asString(body.idempotencyKey) ?? String(body.idempotency_key ?? ""),
        metadata: body.metadata,
      });
      return NextResponse.json({ ok: true, usage });
    }

    if (action === "charge.create") {
      const charge = await createServiceBillingCharge({
        pageId,
        accountId: asString(body.accountId) ?? String(body.account_id ?? ""),
        description: asString(body.description) ?? "",
        quantity: Number(body.quantity ?? 1),
        unitAmountCents: Number(body.unitAmountCents ?? body.unit_amount_cents ?? 0),
        currency: asString(body.currency) ?? null,
        kind: asString(body.kind) ?? null,
        planId: asString(body.planId) ?? asString(body.plan_id) ?? null,
        taxRateBasisPoints: Number(body.taxRateBasisPoints ?? body.tax_rate_basis_points ?? 0),
        platformFeeBasisPoints: Number(body.platformFeeBasisPoints ?? body.platform_fee_basis_points ?? 0),
        externalRef: asString(body.externalRef) ?? asString(body.external_ref) ?? null,
        metadata: body.metadata,
      });
      return NextResponse.json({ ok: true, charge });
    }

    if (action === "invoice.generate") {
      const invoice = await generateServiceBillingInvoice({
        pageId,
        accountId: asString(body.accountId) ?? String(body.account_id ?? ""),
        dueAt: asString(body.dueAt) ?? asString(body.due_at) ?? null,
        periodStart: asString(body.periodStart) ?? asString(body.period_start) ?? null,
        periodEnd: asString(body.periodEnd) ?? asString(body.period_end) ?? null,
        metadata: body.metadata,
      });
      return NextResponse.json({ ok: true, invoice });
    }

    if (action === "invoice.pay") {
      const invoice = await markServiceBillingInvoicePaid({
        pageId,
        invoiceId: asString(body.invoiceId) ?? String(body.invoice_id ?? ""),
        amountPaidCents: Number(body.amountPaidCents ?? body.amount_paid_cents ?? 0),
        externalRef: asString(body.externalRef) ?? asString(body.external_ref) ?? null,
        metadata: body.metadata,
      });
      return NextResponse.json({ ok: true, invoice });
    }

    if (action === "settlement.run") {
      const settlement = await runServiceBillingSettlement({
        pageId,
        invoiceId: asString(body.invoiceId) ?? String(body.invoice_id ?? ""),
        metadata: body.metadata,
      });
      return NextResponse.json({ ok: true, settlement });
    }

    return apiErrorJson("invalid_action", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "service_billing_failed";
    return apiErrorJson(code, 400);
  }
}
