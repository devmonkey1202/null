-- CreateTable
CREATE TABLE "ServiceSearchIndex" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "title_fields" JSONB,
    "body_fields" JSONB,
    "facet_fields" JSONB,
    "sort_field" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'owner',
    "scope_mode" TEXT NOT NULL DEFAULT 'all',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceSearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSearchDocument" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "index_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "facets" JSONB,
    "sort_text" TEXT,
    "sort_number" DOUBLE PRECISION,
    "sort_date" TIMESTAMP(3),
    "app_user_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceSearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSearchIndex_page_id_key_key" ON "ServiceSearchIndex"("page_id", "key");

-- CreateIndex
CREATE INDEX "ServiceSearchIndex_page_id_source_type_source_key_idx" ON "ServiceSearchIndex"("page_id", "source_type", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSearchDocument_index_id_source_id_key" ON "ServiceSearchDocument"("index_id", "source_id");

-- CreateIndex
CREATE INDEX "ServiceSearchDocument_page_id_index_id_idx" ON "ServiceSearchDocument"("page_id", "index_id");

-- CreateIndex
CREATE INDEX "ServiceSearchDocument_page_id_source_type_source_key_idx" ON "ServiceSearchDocument"("page_id", "source_type", "source_key");

-- CreateIndex
CREATE INDEX "ServiceSearchDocument_page_id_app_user_id_idx" ON "ServiceSearchDocument"("page_id", "app_user_id");

-- CreateIndex
CREATE INDEX "ServiceSearchDocument_page_id_updated_at_idx" ON "ServiceSearchDocument"("page_id", "updated_at");

-- AddForeignKey
ALTER TABLE "ServiceSearchIndex" ADD CONSTRAINT "ServiceSearchIndex_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSearchDocument" ADD CONSTRAINT "ServiceSearchDocument_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSearchDocument" ADD CONSTRAINT "ServiceSearchDocument_index_id_fkey" FOREIGN KEY ("index_id") REFERENCES "ServiceSearchIndex"("id") ON DELETE CASCADE ON UPDATE CASCADE;
