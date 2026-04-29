-- CreateTable
CREATE TABLE "ServiceBillingAccount" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "scope_type" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "org_id" TEXT,
  "team_id" TEXT,
  "app_user_id" TEXT,
  "customer_name" TEXT,
  "email" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'KRW',
  "provider_customer_ref" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBillingPlan" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "charge_model" TEXT NOT NULL,
  "billing_interval" TEXT NOT NULL DEFAULT 'once',
  "unit_amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KRW',
  "usage_metric" TEXT,
  "included_units" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 0,
  "platform_fee_basis_points" INTEGER NOT NULL DEFAULT 0,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "provider_price_ref" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBillingSubscription" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "provider_ref" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBillingUsageRecord" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_end" TIMESTAMP(3) NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "metadata" JSONB,
  "invoiced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBillingUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBillingCharge" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "plan_id" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'one_time',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "unit_amount_cents" INTEGER NOT NULL,
  "subtotal_cents" INTEGER NOT NULL,
  "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 0,
  "platform_fee_basis_points" INTEGER NOT NULL DEFAULT 0,
  "tax_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KRW',
  "external_ref" TEXT,
  "metadata" JSONB,
  "invoiced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBillingCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBillingInvoice" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "currency" TEXT NOT NULL DEFAULT 'KRW',
  "subtotal_cents" INTEGER NOT NULL,
  "tax_cents" INTEGER NOT NULL,
  "adjustment_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cents" INTEGER NOT NULL,
  "amount_paid_cents" INTEGER NOT NULL DEFAULT 0,
  "due_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "period_start" TIMESTAMP(3),
  "period_end" TIMESTAMP(3),
  "external_ref" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBillingInvoiceLine" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "plan_id" TEXT,
  "subscription_id" TEXT,
  "usage_record_id" TEXT,
  "charge_id" TEXT,
  "kind" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "unit_amount_cents" INTEGER NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KRW',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBillingInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBillingSettlement" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "recipient_type" TEXT NOT NULL,
  "recipient_key" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KRW',
  "gross_cents" INTEGER NOT NULL,
  "fee_cents" INTEGER NOT NULL,
  "net_cents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'settled',
  "settled_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceBillingSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBillingAccount_page_id_scope_type_scope_key_key" ON "ServiceBillingAccount"("page_id", "scope_type", "scope_key");
CREATE INDEX "ServiceBillingAccount_page_id_org_id_idx" ON "ServiceBillingAccount"("page_id", "org_id");
CREATE INDEX "ServiceBillingAccount_page_id_team_id_idx" ON "ServiceBillingAccount"("page_id", "team_id");
CREATE INDEX "ServiceBillingAccount_page_id_app_user_id_idx" ON "ServiceBillingAccount"("page_id", "app_user_id");

CREATE UNIQUE INDEX "ServiceBillingPlan_page_id_key_key" ON "ServiceBillingPlan"("page_id", "key");
CREATE INDEX "ServiceBillingPlan_page_id_active_charge_model_idx" ON "ServiceBillingPlan"("page_id", "active", "charge_model");

CREATE INDEX "ServiceBillingSubscription_page_id_account_id_status_idx" ON "ServiceBillingSubscription"("page_id", "account_id", "status");
CREATE INDEX "ServiceBillingSubscription_page_id_plan_id_status_idx" ON "ServiceBillingSubscription"("page_id", "plan_id", "status");

CREATE UNIQUE INDEX "ServiceBillingUsageRecord_page_id_idempotency_key_key" ON "ServiceBillingUsageRecord"("page_id", "idempotency_key");
CREATE INDEX "ServiceBillingUsageRecord_page_id_account_id_invoiced_at_idx" ON "ServiceBillingUsageRecord"("page_id", "account_id", "invoiced_at");
CREATE INDEX "ServiceBillingUsageRecord_page_id_plan_id_metric_window_start_idx" ON "ServiceBillingUsageRecord"("page_id", "plan_id", "metric", "window_start");

CREATE INDEX "ServiceBillingCharge_page_id_account_id_status_created_at_idx" ON "ServiceBillingCharge"("page_id", "account_id", "status", "created_at");
CREATE INDEX "ServiceBillingCharge_page_id_invoiced_at_status_idx" ON "ServiceBillingCharge"("page_id", "invoiced_at", "status");

CREATE UNIQUE INDEX "ServiceBillingInvoice_page_id_number_key" ON "ServiceBillingInvoice"("page_id", "number");
CREATE INDEX "ServiceBillingInvoice_page_id_account_id_status_created_at_idx" ON "ServiceBillingInvoice"("page_id", "account_id", "status", "created_at");

CREATE INDEX "ServiceBillingInvoiceLine_page_id_invoice_id_idx" ON "ServiceBillingInvoiceLine"("page_id", "invoice_id");
CREATE INDEX "ServiceBillingInvoiceLine_invoice_id_kind_idx" ON "ServiceBillingInvoiceLine"("invoice_id", "kind");

CREATE INDEX "ServiceBillingSettlement_page_id_account_id_created_at_idx" ON "ServiceBillingSettlement"("page_id", "account_id", "created_at");
CREATE INDEX "ServiceBillingSettlement_page_id_invoice_id_idx" ON "ServiceBillingSettlement"("page_id", "invoice_id");

-- AddForeignKey
ALTER TABLE "ServiceBillingAccount" ADD CONSTRAINT "ServiceBillingAccount_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingPlan" ADD CONSTRAINT "ServiceBillingPlan_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingSubscription" ADD CONSTRAINT "ServiceBillingSubscription_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingSubscription" ADD CONSTRAINT "ServiceBillingSubscription_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ServiceBillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingSubscription" ADD CONSTRAINT "ServiceBillingSubscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "ServiceBillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingUsageRecord" ADD CONSTRAINT "ServiceBillingUsageRecord_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingUsageRecord" ADD CONSTRAINT "ServiceBillingUsageRecord_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ServiceBillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingUsageRecord" ADD CONSTRAINT "ServiceBillingUsageRecord_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "ServiceBillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingCharge" ADD CONSTRAINT "ServiceBillingCharge_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingCharge" ADD CONSTRAINT "ServiceBillingCharge_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ServiceBillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingCharge" ADD CONSTRAINT "ServiceBillingCharge_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "ServiceBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingInvoice" ADD CONSTRAINT "ServiceBillingInvoice_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingInvoice" ADD CONSTRAINT "ServiceBillingInvoice_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ServiceBillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingInvoiceLine" ADD CONSTRAINT "ServiceBillingInvoiceLine_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingInvoiceLine" ADD CONSTRAINT "ServiceBillingInvoiceLine_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ServiceBillingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingInvoiceLine" ADD CONSTRAINT "ServiceBillingInvoiceLine_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "ServiceBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingInvoiceLine" ADD CONSTRAINT "ServiceBillingInvoiceLine_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "ServiceBillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingInvoiceLine" ADD CONSTRAINT "ServiceBillingInvoiceLine_usage_record_id_fkey" FOREIGN KEY ("usage_record_id") REFERENCES "ServiceBillingUsageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingInvoiceLine" ADD CONSTRAINT "ServiceBillingInvoiceLine_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "ServiceBillingCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingSettlement" ADD CONSTRAINT "ServiceBillingSettlement_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingSettlement" ADD CONSTRAINT "ServiceBillingSettlement_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ServiceBillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBillingSettlement" ADD CONSTRAINT "ServiceBillingSettlement_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ServiceBillingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
