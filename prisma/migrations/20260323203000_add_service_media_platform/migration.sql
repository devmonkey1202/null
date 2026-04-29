-- CreateTable
CREATE TABLE "ServiceMediaAsset" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "backend" TEXT NOT NULL,
    "storage_scope" TEXT NOT NULL DEFAULT 'private',
    "storage_key" TEXT NOT NULL,
    "public_url" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'signed',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "placeholder_data_url" TEXT,
    "metadata" JSONB,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMediaVariant" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "backend" TEXT NOT NULL,
    "storage_scope" TEXT NOT NULL DEFAULT 'private',
    "storage_key" TEXT NOT NULL,
    "public_url" TEXT,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceMediaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMediaUploadSession" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "total_size" INTEGER NOT NULL,
    "chunk_size" INTEGER NOT NULL,
    "received_size" INTEGER NOT NULL DEFAULT 0,
    "storage_scope" TEXT NOT NULL DEFAULT 'private',
    "temp_storage_key" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'open',
    "completed_asset_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceMediaUploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMediaAsset_page_id_key_key" ON "ServiceMediaAsset"("page_id", "key");

-- CreateIndex
CREATE INDEX "ServiceMediaAsset_page_id_kind_created_at_idx" ON "ServiceMediaAsset"("page_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "ServiceMediaAsset_page_id_status_created_at_idx" ON "ServiceMediaAsset"("page_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMediaVariant_asset_id_name_key" ON "ServiceMediaVariant"("asset_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMediaVariant_page_id_key_key" ON "ServiceMediaVariant"("page_id", "key");

-- CreateIndex
CREATE INDEX "ServiceMediaVariant_page_id_asset_id_idx" ON "ServiceMediaVariant"("page_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMediaUploadSession_page_id_key_key" ON "ServiceMediaUploadSession"("page_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMediaUploadSession_temp_storage_key_key" ON "ServiceMediaUploadSession"("temp_storage_key");

-- CreateIndex
CREATE INDEX "ServiceMediaUploadSession_page_id_status_expires_at_idx" ON "ServiceMediaUploadSession"("page_id", "status", "expires_at");

-- AddForeignKey
ALTER TABLE "ServiceMediaAsset" ADD CONSTRAINT "ServiceMediaAsset_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMediaVariant" ADD CONSTRAINT "ServiceMediaVariant_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMediaVariant" ADD CONSTRAINT "ServiceMediaVariant_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "ServiceMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMediaUploadSession" ADD CONSTRAINT "ServiceMediaUploadSession_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
