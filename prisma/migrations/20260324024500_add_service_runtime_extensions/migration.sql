CREATE TABLE "ServiceRuntimeModule" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'generic',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sandbox" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceRuntimeModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceRuntimeFunction" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "module_id" TEXT,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "target" TEXT NOT NULL DEFAULT 'generic',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "code" TEXT NOT NULL,
  "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
  "memory_mb" INTEGER NOT NULL DEFAULT 128,
  "network_mode" TEXT NOT NULL DEFAULT 'inherit',
  "network_allow" JSONB,
  "network_deny" JSONB,
  "secret_keys" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceRuntimeFunction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceRuntimeModule_page_id_key_key" ON "ServiceRuntimeModule"("page_id", "key");
CREATE INDEX "ServiceRuntimeModule_page_id_kind_enabled_idx" ON "ServiceRuntimeModule"("page_id", "kind", "enabled");

CREATE UNIQUE INDEX "ServiceRuntimeFunction_page_id_key_key" ON "ServiceRuntimeFunction"("page_id", "key");
CREATE INDEX "ServiceRuntimeFunction_page_id_target_enabled_idx" ON "ServiceRuntimeFunction"("page_id", "target", "enabled");
CREATE INDEX "ServiceRuntimeFunction_module_id_idx" ON "ServiceRuntimeFunction"("module_id");

ALTER TABLE "ServiceRuntimeModule"
  ADD CONSTRAINT "ServiceRuntimeModule_page_id_fkey"
  FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceRuntimeFunction"
  ADD CONSTRAINT "ServiceRuntimeFunction_page_id_fkey"
  FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceRuntimeFunction"
  ADD CONSTRAINT "ServiceRuntimeFunction_module_id_fkey"
  FOREIGN KEY ("module_id") REFERENCES "ServiceRuntimeModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
