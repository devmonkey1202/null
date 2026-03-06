-- CreateTable
CREATE TABLE "PageAuditLog" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "actor_user_id" TEXT,
    "actor_anon_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageAuditLog_page_id_created_at_idx" ON "PageAuditLog"("page_id", "created_at");

-- CreateIndex
CREATE INDEX "PageAuditLog_action_created_at_idx" ON "PageAuditLog"("action", "created_at");

-- CreateIndex
CREATE INDEX "PageAuditLog_actor_user_id_idx" ON "PageAuditLog"("actor_user_id");

-- AddForeignKey
ALTER TABLE "PageAuditLog" ADD CONSTRAINT "PageAuditLog_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageAuditLog" ADD CONSTRAINT "PageAuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
