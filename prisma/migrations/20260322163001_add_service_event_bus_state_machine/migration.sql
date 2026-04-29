-- CreateTable
CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "event_key" TEXT,
    "type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "source" TEXT,
    "payload" JSONB,
    "meta" JSONB,
    "status" TEXT NOT NULL DEFAULT 'published',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "dead_lettered_at" TIMESTAMP(3),
    "compensation_of_id" TEXT,

    CONSTRAINT "ServiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStateMachine" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceStateMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStateInstance" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "current_state" TEXT NOT NULL,
    "data" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "last_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceStateInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStateTransition" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "event_id" TEXT,
    "transition_key" TEXT NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "reason" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceStateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceEvent_page_id_stream_published_at_idx" ON "ServiceEvent"("page_id", "stream", "published_at");

-- CreateIndex
CREATE INDEX "ServiceEvent_page_id_topic_published_at_idx" ON "ServiceEvent"("page_id", "topic", "published_at");

-- CreateIndex
CREATE INDEX "ServiceEvent_page_id_entity_type_entity_id_published_at_idx" ON "ServiceEvent"("page_id", "entity_type", "entity_id", "published_at");

-- CreateIndex
CREATE INDEX "ServiceEvent_page_id_status_available_at_idx" ON "ServiceEvent"("page_id", "status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceEvent_page_id_stream_event_key_key" ON "ServiceEvent"("page_id", "stream", "event_key");

-- CreateIndex
CREATE INDEX "ServiceStateMachine_page_id_enabled_idx" ON "ServiceStateMachine"("page_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceStateMachine_page_id_key_key" ON "ServiceStateMachine"("page_id", "key");

-- CreateIndex
CREATE INDEX "ServiceStateInstance_page_id_entity_type_entity_id_idx" ON "ServiceStateInstance"("page_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceStateInstance_machine_id_entity_type_entity_id_key" ON "ServiceStateInstance"("machine_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ServiceStateTransition_page_id_created_at_idx" ON "ServiceStateTransition"("page_id", "created_at");

-- CreateIndex
CREATE INDEX "ServiceStateTransition_machine_id_instance_id_created_at_idx" ON "ServiceStateTransition"("machine_id", "instance_id", "created_at");

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_compensation_of_id_fkey" FOREIGN KEY ("compensation_of_id") REFERENCES "ServiceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStateMachine" ADD CONSTRAINT "ServiceStateMachine_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStateInstance" ADD CONSTRAINT "ServiceStateInstance_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStateInstance" ADD CONSTRAINT "ServiceStateInstance_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "ServiceStateMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStateInstance" ADD CONSTRAINT "ServiceStateInstance_last_event_id_fkey" FOREIGN KEY ("last_event_id") REFERENCES "ServiceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStateTransition" ADD CONSTRAINT "ServiceStateTransition_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStateTransition" ADD CONSTRAINT "ServiceStateTransition_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "ServiceStateMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStateTransition" ADD CONSTRAINT "ServiceStateTransition_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "ServiceStateInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStateTransition" ADD CONSTRAINT "ServiceStateTransition_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "ServiceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
