-- CreateTable
CREATE TABLE "ServiceRealtimeChannel" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'generic',
    "config" JSONB,
    "message_limit" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRealtimeChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRealtimeMessage" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message_key" TEXT,
    "type" TEXT NOT NULL DEFAULT 'message',
    "sender_key" TEXT NOT NULL,
    "sender_name" TEXT,
    "body" JSONB,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRealtimeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRealtimePresence" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "connection_key" TEXT NOT NULL,
    "member_key" TEXT NOT NULL,
    "session_id" TEXT,
    "socket_id" TEXT,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "meta" JSONB,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRealtimePresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRealtimeReceipt" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRealtimeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRealtimeChannel_page_id_topic_idx" ON "ServiceRealtimeChannel"("page_id", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRealtimeChannel_page_id_key_key" ON "ServiceRealtimeChannel"("page_id", "key");

-- CreateIndex
CREATE INDEX "ServiceRealtimeMessage_page_id_created_at_idx" ON "ServiceRealtimeMessage"("page_id", "created_at");

-- CreateIndex
CREATE INDEX "ServiceRealtimeMessage_channel_id_created_at_idx" ON "ServiceRealtimeMessage"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "ServiceRealtimeMessage_channel_id_sender_key_message_key_idx" ON "ServiceRealtimeMessage"("channel_id", "sender_key", "message_key");

-- CreateIndex
CREATE INDEX "ServiceRealtimePresence_page_id_member_key_idx" ON "ServiceRealtimePresence"("page_id", "member_key");

-- CreateIndex
CREATE INDEX "ServiceRealtimePresence_channel_id_last_seen_at_idx" ON "ServiceRealtimePresence"("channel_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRealtimePresence_channel_id_connection_key_key" ON "ServiceRealtimePresence"("channel_id", "connection_key");

-- CreateIndex
CREATE INDEX "ServiceRealtimeReceipt_page_id_recipient_key_idx" ON "ServiceRealtimeReceipt"("page_id", "recipient_key");

-- CreateIndex
CREATE INDEX "ServiceRealtimeReceipt_channel_id_updated_at_idx" ON "ServiceRealtimeReceipt"("channel_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRealtimeReceipt_message_id_recipient_key_key" ON "ServiceRealtimeReceipt"("message_id", "recipient_key");

-- AddForeignKey
ALTER TABLE "ServiceRealtimeChannel" ADD CONSTRAINT "ServiceRealtimeChannel_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRealtimeMessage" ADD CONSTRAINT "ServiceRealtimeMessage_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRealtimeMessage" ADD CONSTRAINT "ServiceRealtimeMessage_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "ServiceRealtimeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRealtimePresence" ADD CONSTRAINT "ServiceRealtimePresence_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRealtimePresence" ADD CONSTRAINT "ServiceRealtimePresence_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "ServiceRealtimeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRealtimeReceipt" ADD CONSTRAINT "ServiceRealtimeReceipt_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRealtimeReceipt" ADD CONSTRAINT "ServiceRealtimeReceipt_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "ServiceRealtimeChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRealtimeReceipt" ADD CONSTRAINT "ServiceRealtimeReceipt_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ServiceRealtimeMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
