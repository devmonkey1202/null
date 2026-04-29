-- CreateTable
CREATE TABLE "ServiceRankingRule" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "title_fields" JSONB,
    "excerpt_fields" JSONB,
    "facet_fields" JSONB,
    "visibility" TEXT NOT NULL DEFAULT 'owner',
    "scope_mode" TEXT NOT NULL DEFAULT 'all',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceRankingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRankingSnapshot" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT,
    "excerpt" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER,
    "facets" JSONB,
    "app_user_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceRankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRankingRule_page_id_key_key" ON "ServiceRankingRule"("page_id", "key");

-- CreateIndex
CREATE INDEX "ServiceRankingRule_page_id_source_type_source_key_idx" ON "ServiceRankingRule"("page_id", "source_type", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRankingSnapshot_rule_id_source_id_key" ON "ServiceRankingSnapshot"("rule_id", "source_id");

-- CreateIndex
CREATE INDEX "ServiceRankingSnapshot_page_id_rule_id_idx" ON "ServiceRankingSnapshot"("page_id", "rule_id");

-- CreateIndex
CREATE INDEX "ServiceRankingSnapshot_page_id_source_type_source_key_idx" ON "ServiceRankingSnapshot"("page_id", "source_type", "source_key");

-- CreateIndex
CREATE INDEX "ServiceRankingSnapshot_page_id_app_user_id_idx" ON "ServiceRankingSnapshot"("page_id", "app_user_id");

-- CreateIndex
CREATE INDEX "ServiceRankingSnapshot_page_id_score_updated_at_idx" ON "ServiceRankingSnapshot"("page_id", "score", "updated_at");

-- AddForeignKey
ALTER TABLE "ServiceRankingRule" ADD CONSTRAINT "ServiceRankingRule_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRankingSnapshot" ADD CONSTRAINT "ServiceRankingSnapshot_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRankingSnapshot" ADD CONSTRAINT "ServiceRankingSnapshot_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "ServiceRankingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
