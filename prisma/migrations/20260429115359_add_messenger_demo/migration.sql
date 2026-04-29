-- CreateTable
CREATE TABLE "MessengerUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "status_message" TEXT,
    "accent" TEXT NOT NULL DEFAULT '#111827',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessengerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessengerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerFriendRequest" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessengerFriendRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerFriendship" (
    "id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "nickname_a" TEXT,
    "nickname_b" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessengerFriendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerConversation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'direct',
    "title" TEXT,
    "avatar_url" TEXT,
    "created_by_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessengerConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerConversationMember" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "nickname" TEXT,
    "last_read_message_id" TEXT,
    "last_read_at" TIMESTAMP(3),
    "muted_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessengerConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerMessage" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "MessengerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerNotification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "message_id" TEXT,
    "call_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessengerNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessengerCall" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "caller_id" TEXT NOT NULL,
    "receiver_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "offer" JSONB,
    "answer" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessengerCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessengerUser_email_key" ON "MessengerUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MessengerUser_handle_key" ON "MessengerUser"("handle");

-- CreateIndex
CREATE INDEX "MessengerUser_handle_idx" ON "MessengerUser"("handle");

-- CreateIndex
CREATE INDEX "MessengerUser_display_name_idx" ON "MessengerUser"("display_name");

-- CreateIndex
CREATE UNIQUE INDEX "MessengerSession_token_key" ON "MessengerSession"("token");

-- CreateIndex
CREATE INDEX "MessengerSession_token_idx" ON "MessengerSession"("token");

-- CreateIndex
CREATE INDEX "MessengerSession_user_id_idx" ON "MessengerSession"("user_id");

-- CreateIndex
CREATE INDEX "MessengerFriendRequest_receiver_id_status_idx" ON "MessengerFriendRequest"("receiver_id", "status");

-- CreateIndex
CREATE INDEX "MessengerFriendRequest_requester_id_status_idx" ON "MessengerFriendRequest"("requester_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessengerFriendRequest_requester_id_receiver_id_key" ON "MessengerFriendRequest"("requester_id", "receiver_id");

-- CreateIndex
CREATE INDEX "MessengerFriendship_user_a_id_idx" ON "MessengerFriendship"("user_a_id");

-- CreateIndex
CREATE INDEX "MessengerFriendship_user_b_id_idx" ON "MessengerFriendship"("user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "MessengerFriendship_user_a_id_user_b_id_key" ON "MessengerFriendship"("user_a_id", "user_b_id");

-- CreateIndex
CREATE INDEX "MessengerConversation_last_message_at_idx" ON "MessengerConversation"("last_message_at");

-- CreateIndex
CREATE INDEX "MessengerConversation_created_by_id_idx" ON "MessengerConversation"("created_by_id");

-- CreateIndex
CREATE INDEX "MessengerConversationMember_user_id_idx" ON "MessengerConversationMember"("user_id");

-- CreateIndex
CREATE INDEX "MessengerConversationMember_conversation_id_idx" ON "MessengerConversationMember"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "MessengerConversationMember_conversation_id_user_id_key" ON "MessengerConversationMember"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "MessengerMessage_conversation_id_created_at_idx" ON "MessengerMessage"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "MessengerMessage_sender_id_created_at_idx" ON "MessengerMessage"("sender_id", "created_at");

-- CreateIndex
CREATE INDEX "MessengerNotification_user_id_read_at_created_at_idx" ON "MessengerNotification"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "MessengerNotification_conversation_id_created_at_idx" ON "MessengerNotification"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "MessengerCall_conversation_id_status_idx" ON "MessengerCall"("conversation_id", "status");

-- CreateIndex
CREATE INDEX "MessengerCall_caller_id_created_at_idx" ON "MessengerCall"("caller_id", "created_at");

-- CreateIndex
CREATE INDEX "MessengerCall_receiver_id_created_at_idx" ON "MessengerCall"("receiver_id", "created_at");

-- AddForeignKey
ALTER TABLE "MessengerSession" ADD CONSTRAINT "MessengerSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerFriendRequest" ADD CONSTRAINT "MessengerFriendRequest_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerFriendRequest" ADD CONSTRAINT "MessengerFriendRequest_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerFriendship" ADD CONSTRAINT "MessengerFriendship_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerFriendship" ADD CONSTRAINT "MessengerFriendship_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerConversationMember" ADD CONSTRAINT "MessengerConversationMember_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "MessengerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerConversationMember" ADD CONSTRAINT "MessengerConversationMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerMessage" ADD CONSTRAINT "MessengerMessage_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "MessengerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerMessage" ADD CONSTRAINT "MessengerMessage_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerNotification" ADD CONSTRAINT "MessengerNotification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerNotification" ADD CONSTRAINT "MessengerNotification_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "MessengerMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerNotification" ADD CONSTRAINT "MessengerNotification_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "MessengerCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerCall" ADD CONSTRAINT "MessengerCall_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "MessengerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerCall" ADD CONSTRAINT "MessengerCall_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "MessengerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessengerCall" ADD CONSTRAINT "MessengerCall_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "MessengerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
