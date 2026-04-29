ALTER TYPE "BackgroundJobStatus" ADD VALUE IF NOT EXISTS 'dead_lettered';

ALTER TABLE "BackgroundJob"
  ADD COLUMN IF NOT EXISTS "queue" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 100;

CREATE UNIQUE INDEX IF NOT EXISTS "BackgroundJob_page_id_queue_dedupe_key_key"
  ON "BackgroundJob"("page_id", "queue", "dedupe_key");

CREATE INDEX IF NOT EXISTS "BackgroundJob_queue_status_priority_run_at_idx"
  ON "BackgroundJob"("queue", "status", "priority", "run_at");

CREATE TABLE IF NOT EXISTS "BackgroundJobDeadLetter" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "page_id" TEXT,
  "queue" TEXT NOT NULL DEFAULT 'default',
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "attempts" INTEGER NOT NULL,
  "max_attempts" INTEGER NOT NULL,
  "last_error" TEXT,
  "failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundJobDeadLetter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BackgroundJobDeadLetter_job_id_key"
  ON "BackgroundJobDeadLetter"("job_id");

CREATE INDEX IF NOT EXISTS "BackgroundJobDeadLetter_queue_failed_at_idx"
  ON "BackgroundJobDeadLetter"("queue", "failed_at");

CREATE INDEX IF NOT EXISTS "BackgroundJobDeadLetter_page_id_queue_failed_at_idx"
  ON "BackgroundJobDeadLetter"("page_id", "queue", "failed_at");
