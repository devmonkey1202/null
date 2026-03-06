-- Step 7 (Abuse & Admin) migration
-- IMPORTANT:
-- - Any policy-sensitive choices remain TODO(정책확정 필요) in app code.
-- - This migration only adds tables/columns/indexes needed for Step 7.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReportAction" AS ENUM ('none', 'hide_page', 'force_expire', 'suspend_owner', 'ban_ip');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMP(3);
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "hidden_reason" TEXT;
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "hidden_by_admin_id" TEXT;
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "forced_expired_at" TIMESTAMP(3);
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "forced_by_admin_id" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "action" "ReportAction" NOT NULL DEFAULT 'none';
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "admin_note" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "handled_at" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "handled_by_admin_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminSession" (
  "id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "ip_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IpBlock" (
  "id" TEXT NOT NULL,
  "ip_hash" TEXT NOT NULL,
  "reason" TEXT,
  "created_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),

  CONSTRAINT "IpBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AdminSession_token_hash_key" ON "AdminSession"("token_hash");
CREATE INDEX IF NOT EXISTS "AdminSession_admin_id_expires_at_idx" ON "AdminSession"("admin_id", "expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "IpBlock_ip_hash_key" ON "IpBlock"("ip_hash");
CREATE INDEX IF NOT EXISTS "IpBlock_expires_at_idx" ON "IpBlock"("expires_at");

-- Indices to match current schema additions
CREATE INDEX IF NOT EXISTS "Page_status_live_expires_at_idx" ON "Page"("status", "live_expires_at");
CREATE INDEX IF NOT EXISTS "LiveSession_page_id_started_at_idx" ON "LiveSession"("page_id", "started_at");

CREATE INDEX IF NOT EXISTS "Event_page_id_ts_idx" ON "Event"("page_id", "ts");
CREATE INDEX IF NOT EXISTS "Event_live_session_id_ts_idx" ON "Event"("live_session_id", "ts");

CREATE INDEX IF NOT EXISTS "Upvote_page_id_created_at_idx" ON "Upvote"("page_id", "created_at");

CREATE INDEX IF NOT EXISTS "Report_page_id_status_idx" ON "Report"("page_id", "status");
CREATE INDEX IF NOT EXISTS "Report_status_created_at_idx" ON "Report"("status", "created_at");

CREATE INDEX IF NOT EXISTS "ReportAbuse_report_id_created_at_idx" ON "ReportAbuse"("report_id", "created_at");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "Page" ADD CONSTRAINT "Page_hidden_by_admin_id_fkey" FOREIGN KEY ("hidden_by_admin_id") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Page" ADD CONSTRAINT "Page_forced_by_admin_id_fkey" FOREIGN KEY ("forced_by_admin_id") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Report" ADD CONSTRAINT "Report_handled_by_admin_id_fkey" FOREIGN KEY ("handled_by_admin_id") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "IpBlock" ADD CONSTRAINT "IpBlock_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
