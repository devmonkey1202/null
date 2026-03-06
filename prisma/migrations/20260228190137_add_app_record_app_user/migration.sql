-- AlterTable
ALTER TABLE "AppRecord" ADD COLUMN     "app_user_id" TEXT;

-- CreateIndex
CREATE INDEX "AppRecord_page_id_collection_slug_app_user_id_idx" ON "AppRecord"("page_id", "collection_slug", "app_user_id");

-- CreateIndex
CREATE INDEX "AppRecord_app_user_id_idx" ON "AppRecord"("app_user_id");

-- AddForeignKey
ALTER TABLE "AppRecord" ADD CONSTRAINT "AppRecord_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
