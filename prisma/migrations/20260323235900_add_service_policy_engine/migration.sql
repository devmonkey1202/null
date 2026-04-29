-- CreateTable
CREATE TABLE "ServicePolicyRule" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "effect" TEXT NOT NULL DEFAULT 'allow',
  "action_key" TEXT NOT NULL DEFAULT '*',
  "resource_type" TEXT NOT NULL DEFAULT '*',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "conditions" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServicePolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePolicyApprovalRequest" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "rule_id" TEXT,
  "action_key" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "subject_key" TEXT NOT NULL,
  "subject_label" TEXT,
  "target_key" TEXT,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "note" TEXT,
  "context" JSONB,
  "requested_by_user_id" TEXT,
  "requested_by_app_user_id" TEXT,
  "decided_by_user_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServicePolicyApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePolicyOverride" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "rule_id" TEXT,
  "key" TEXT NOT NULL,
  "subject_key" TEXT NOT NULL,
  "effect" TEXT NOT NULL,
  "action_key" TEXT,
  "resource_type" TEXT,
  "reason" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "expires_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServicePolicyOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRiskIncident" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "subject_key" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "signal_count" INTEGER NOT NULL DEFAULT 1,
  "detail" JSONB,
  "metadata" JSONB,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceRiskIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRiskSanction" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "incident_id" TEXT,
  "key" TEXT NOT NULL,
  "subject_key" TEXT NOT NULL,
  "sanction_type" TEXT NOT NULL,
  "action_key" TEXT,
  "resource_type" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "reason" TEXT,
  "metadata" JSONB,
  "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceRiskSanction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServicePolicyRule_page_id_key_key" ON "ServicePolicyRule"("page_id", "key");
CREATE INDEX "ServicePolicyRule_page_id_action_key_resource_type_enabled_prio_idx" ON "ServicePolicyRule"("page_id", "action_key", "resource_type", "enabled", "priority");

CREATE INDEX "ServicePolicyApprovalRequest_page_id_subject_key_action_res_status_idx" ON "ServicePolicyApprovalRequest"("page_id", "subject_key", "action_key", "resource_type", "status");
CREATE INDEX "ServicePolicyApprovalRequest_page_id_rule_id_status_idx" ON "ServicePolicyApprovalRequest"("page_id", "rule_id", "status");

CREATE UNIQUE INDEX "ServicePolicyOverride_page_id_key_key" ON "ServicePolicyOverride"("page_id", "key");
CREATE INDEX "ServicePolicyOverride_page_id_subject_key_enabled_expires_at_idx" ON "ServicePolicyOverride"("page_id", "subject_key", "enabled", "expires_at");

CREATE UNIQUE INDEX "ServiceRiskIncident_page_id_key_key" ON "ServiceRiskIncident"("page_id", "key");
CREATE INDEX "ServiceRiskIncident_page_id_subject_key_status_created_at_idx" ON "ServiceRiskIncident"("page_id", "subject_key", "status", "created_at");
CREATE INDEX "ServiceRiskIncident_page_id_category_status_created_at_idx" ON "ServiceRiskIncident"("page_id", "category", "status", "created_at");

CREATE UNIQUE INDEX "ServiceRiskSanction_page_id_key_key" ON "ServiceRiskSanction"("page_id", "key");
CREATE INDEX "ServiceRiskSanction_page_id_subject_key_status_expires_at_idx" ON "ServiceRiskSanction"("page_id", "subject_key", "status", "expires_at");
CREATE INDEX "ServiceRiskSanction_page_id_incident_id_status_idx" ON "ServiceRiskSanction"("page_id", "incident_id", "status");

-- AddForeignKey
ALTER TABLE "ServicePolicyRule"
ADD CONSTRAINT "ServicePolicyRule_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServicePolicyApprovalRequest"
ADD CONSTRAINT "ServicePolicyApprovalRequest_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServicePolicyApprovalRequest"
ADD CONSTRAINT "ServicePolicyApprovalRequest_rule_id_fkey"
FOREIGN KEY ("rule_id") REFERENCES "ServicePolicyRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServicePolicyOverride"
ADD CONSTRAINT "ServicePolicyOverride_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServicePolicyOverride"
ADD CONSTRAINT "ServicePolicyOverride_rule_id_fkey"
FOREIGN KEY ("rule_id") REFERENCES "ServicePolicyRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceRiskIncident"
ADD CONSTRAINT "ServiceRiskIncident_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceRiskSanction"
ADD CONSTRAINT "ServiceRiskSanction_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceRiskSanction"
ADD CONSTRAINT "ServiceRiskSanction_incident_id_fkey"
FOREIGN KEY ("incident_id") REFERENCES "ServiceRiskIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
