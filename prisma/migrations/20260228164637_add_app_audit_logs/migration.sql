-- CreateTable
CREATE TABLE "AppAuditLog" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "actor_user_id" TEXT,
    "actor_app_user_id" TEXT,
    "actor_anon_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppAuditLog_page_id_created_at_idx" ON "AppAuditLog"("page_id", "created_at");

-- CreateIndex
CREATE INDEX "AppAuditLog_action_created_at_idx" ON "AppAuditLog"("action", "created_at");

-- CreateIndex
CREATE INDEX "AppAuditLog_actor_user_id_idx" ON "AppAuditLog"("actor_user_id");

-- CreateIndex
CREATE INDEX "AppAuditLog_actor_app_user_id_idx" ON "AppAuditLog"("actor_app_user_id");

-- AddForeignKey
ALTER TABLE "AppAuditLog" ADD CONSTRAINT "AppAuditLog_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAuditLog" ADD CONSTRAINT "AppAuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppAuditLog" ADD CONSTRAINT "AppAuditLog_actor_app_user_id_fkey" FOREIGN KEY ("actor_app_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
