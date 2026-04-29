-- CreateTable
CREATE TABLE "ServiceNotification" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "recipient_label" TEXT,
    "app_user_id" TEXT,
    "type" TEXT NOT NULL DEFAULT 'generic',
    "topic" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT,
    "body" TEXT,
    "payload" JSONB,
    "delivery_channels" JSONB,
    "source_type" TEXT,
    "source_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceNotificationDelivery" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "meta" JSONB,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceNotificationPreference" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "muted_until" TIMESTAMP(3),
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceNotification_page_id_recipient_key_read_at_created_at_idx" ON "ServiceNotification"("page_id", "recipient_key", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "ServiceNotification_page_id_status_scheduled_for_idx" ON "ServiceNotification"("page_id", "status", "scheduled_for");

-- CreateIndex
CREATE INDEX "ServiceNotification_page_id_topic_created_at_idx" ON "ServiceNotification"("page_id", "topic", "created_at");

-- CreateIndex
CREATE INDEX "ServiceNotificationDelivery_page_id_channel_status_created_at_idx" ON "ServiceNotificationDelivery"("page_id", "channel", "status", "created_at");

-- CreateIndex
CREATE INDEX "ServiceNotificationDelivery_notification_id_channel_idx" ON "ServiceNotificationDelivery"("notification_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNotificationPreference_page_id_recipient_key_channel_topic_key" ON "ServiceNotificationPreference"("page_id", "recipient_key", "channel", "topic");

-- CreateIndex
CREATE INDEX "ServiceNotificationPreference_page_id_recipient_key_channel_idx" ON "ServiceNotificationPreference"("page_id", "recipient_key", "channel");

-- AddForeignKey
ALTER TABLE "ServiceNotification" ADD CONSTRAINT "ServiceNotification_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNotificationDelivery" ADD CONSTRAINT "ServiceNotificationDelivery_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNotificationDelivery" ADD CONSTRAINT "ServiceNotificationDelivery_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "ServiceNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNotificationPreference" ADD CONSTRAINT "ServiceNotificationPreference_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
