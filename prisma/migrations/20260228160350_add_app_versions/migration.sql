-- CreateTable
CREATE TABLE "AppRecordVersion" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "collection_slug" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "actor_user_id" TEXT,
    "actor_app_user_id" TEXT,
    "actor_anon_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppRecordVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppWorkflowVersion" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "actor_user_id" TEXT,
    "actor_app_user_id" TEXT,
    "actor_anon_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppWorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppRecordVersion_page_id_record_id_created_at_idx" ON "AppRecordVersion"("page_id", "record_id", "created_at");

-- CreateIndex
CREATE INDEX "AppRecordVersion_page_id_collection_slug_idx" ON "AppRecordVersion"("page_id", "collection_slug");

-- CreateIndex
CREATE INDEX "AppRecordVersion_actor_user_id_idx" ON "AppRecordVersion"("actor_user_id");

-- CreateIndex
CREATE INDEX "AppRecordVersion_actor_app_user_id_idx" ON "AppRecordVersion"("actor_app_user_id");

-- CreateIndex
CREATE INDEX "AppWorkflowVersion_page_id_workflow_id_version_idx" ON "AppWorkflowVersion"("page_id", "workflow_id", "version");

-- CreateIndex
CREATE INDEX "AppWorkflowVersion_page_id_created_at_idx" ON "AppWorkflowVersion"("page_id", "created_at");

-- CreateIndex
CREATE INDEX "AppWorkflowVersion_actor_user_id_idx" ON "AppWorkflowVersion"("actor_user_id");

-- CreateIndex
CREATE INDEX "AppWorkflowVersion_actor_app_user_id_idx" ON "AppWorkflowVersion"("actor_app_user_id");

-- AddForeignKey
ALTER TABLE "AppRecordVersion" ADD CONSTRAINT "AppRecordVersion_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRecordVersion" ADD CONSTRAINT "AppRecordVersion_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppRecordVersion" ADD CONSTRAINT "AppRecordVersion_actor_app_user_id_fkey" FOREIGN KEY ("actor_app_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppWorkflowVersion" ADD CONSTRAINT "AppWorkflowVersion_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppWorkflowVersion" ADD CONSTRAINT "AppWorkflowVersion_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppWorkflowVersion" ADD CONSTRAINT "AppWorkflowVersion_actor_app_user_id_fkey" FOREIGN KEY ("actor_app_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
