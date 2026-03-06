-- CreateEnum
CREATE TYPE "OrgMemberRole" AS ENUM ('owner', 'admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "OrgMemberStatus" AS ENUM ('invited', 'active', 'removed');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('lead', 'member');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AppSsoProvider" AS ENUM ('oauth', 'saml');

-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "otp_backup_codes" JSONB,
ADD COLUMN     "otp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otp_last_used_at" TIMESTAMP(3),
ADD COLUMN     "otp_secret" TEXT;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "org_id" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "role" "OrgMemberRole" NOT NULL DEFAULT 'member',
    "status" "OrgMemberStatus" NOT NULL DEFAULT 'invited',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "org_member_id" TEXT NOT NULL,
    "role" "TeamMemberRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "page_id" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'queued',
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSsoConnection" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "provider" "AppSsoProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "issuer" TEXT,
    "client_id" TEXT,
    "client_secret" TEXT,
    "authorization_url" TEXT,
    "token_url" TEXT,
    "metadata_url" TEXT,
    "certificate_pem" TEXT,
    "entity_id" TEXT,
    "acs_url" TEXT,
    "sign_requests" BOOLEAN NOT NULL DEFAULT false,
    "auto_provision" BOOLEAN NOT NULL DEFAULT false,
    "allow_unlinked" BOOLEAN NOT NULL DEFAULT false,
    "default_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSsoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSsoAccount" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "app_user_id" TEXT NOT NULL,
    "provider" "AppSsoProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSsoAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_owner_id_idx" ON "Organization"("owner_id");

-- CreateIndex
CREATE INDEX "OrganizationMember_org_id_status_idx" ON "OrganizationMember"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_org_id_user_id_key" ON "OrganizationMember"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_org_id_email_key" ON "OrganizationMember"("org_id", "email");

-- CreateIndex
CREATE INDEX "Team_org_id_idx" ON "Team"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "Team_org_id_slug_key" ON "Team"("org_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_team_id_org_member_id_key" ON "TeamMember"("team_id", "org_member_id");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_run_at_idx" ON "BackgroundJob"("status", "run_at");

-- CreateIndex
CREATE INDEX "BackgroundJob_page_id_idx" ON "BackgroundJob"("page_id");

-- CreateIndex
CREATE INDEX "AppSsoConnection_page_id_provider_idx" ON "AppSsoConnection"("page_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AppSsoConnection_page_id_provider_name_key" ON "AppSsoConnection"("page_id", "provider", "name");

-- CreateIndex
CREATE INDEX "AppSsoAccount_page_id_app_user_id_idx" ON "AppSsoAccount"("page_id", "app_user_id");

-- CreateIndex
CREATE INDEX "AppSsoAccount_page_id_provider_idx" ON "AppSsoAccount"("page_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AppSsoAccount_connection_id_subject_key" ON "AppSsoAccount"("connection_id", "subject");

-- CreateIndex
CREATE INDEX "Page_org_id_idx" ON "Page"("org_id");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_org_member_id_fkey" FOREIGN KEY ("org_member_id") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSsoConnection" ADD CONSTRAINT "AppSsoConnection_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSsoAccount" ADD CONSTRAINT "AppSsoAccount_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSsoAccount" ADD CONSTRAINT "AppSsoAccount_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "AppSsoConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSsoAccount" ADD CONSTRAINT "AppSsoAccount_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
