import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { publishServiceEvent } from "@/lib/service-event-bus";

const DEFAULT_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LIMIT = 300;
export const DEFAULT_SERVICE_REALTIME_PRESENCE_TTL_MS = 90_000;

export type ServiceRealtimeChannelKind = "generic" | "chat" | "stream" | "presence";
export type ServiceRealtimePresenceStatus = "online" | "away" | "busy" | "offline";
export type ServiceRealtimeReceiptState = "delivered" | "read";

export type ServiceRealtimeChannelInput = {
  pageId: string;
  key: string;
  topic?: string;
  kind?: ServiceRealtimeChannelKind;
  config?: Record<string, unknown> | null;
  messageLimit?: number;
};

export type ServiceRealtimePresenceInput = {
  pageId: string;
  channelKey: string;
  topic?: string;
  kind?: ServiceRealtimeChannelKind;
  memberKey: string;
  sessionId?: string | null;
  socketId?: string | null;
  name?: string | null;
  status?: ServiceRealtimePresenceStatus;
  meta?: Record<string, unknown> | null;
  actor?: AppAuditActor;
};

export type ServiceRealtimeMessageInput = {
  pageId: string;
  channelKey: string;
  topic?: string;
  kind?: ServiceRealtimeChannelKind;
  senderKey: string;
  senderName?: string | null;
  messageKey?: string | null;
  type?: string;
  body?: unknown;
  meta?: Record<string, unknown> | null;
  actor?: AppAuditActor;
};

export type ServiceRealtimeAckInput = {
  pageId: string;
  channelKey: string;
  messageId: string;
  recipientKey: string;
  state: ServiceRealtimeReceiptState;
  actor?: AppAuditActor;
};

export type ServiceRealtimeReceiptView = {
  id: string;
  messageId: string;
  recipientKey: string;
  deliveredAt: string | null;
  readAt: string | null;
  state: ServiceRealtimeReceiptState;
};

export type ServiceRealtimeMessageView = {
  id: string;
  channelKey: string;
  type: string;
  senderKey: string;
  senderName: string | null;
  messageKey: string | null;
  body: unknown;
  meta: Record<string, unknown> | null;
  createdAt: string;
  receipts: ServiceRealtimeReceiptView[];
};

export type ServiceRealtimePresenceView = {
  id: string;
  channelKey: string;
  connectionKey: string;
  memberKey: string;
  sessionId: string | null;
  socketId: string | null;
  name: string | null;
  status: ServiceRealtimePresenceStatus;
  meta: Record<string, unknown> | null;
  joinedAt: string;
  lastSeenAt: string;
};

export type ServiceRealtimeChannelView = {
  id: string;
  key: string;
  topic: string;
  kind: string;
  config: Record<string, unknown> | null;
  messageLimit: number;
  createdAt: string;
  updatedAt: string;
};

export type ServiceRealtimeSnapshot = {
  channel: ServiceRealtimeChannelView;
  messages: ServiceRealtimeMessageView[];
  presence: ServiceRealtimePresenceView[];
};

function clampMessageLimit(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_MESSAGE_LIMIT;
  return Math.min(MAX_MESSAGE_LIMIT, Math.max(10, Number(value)));
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function normalizeServiceRealtimeChannelKey(raw: string) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_./-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function buildServiceRealtimeConnectionKey(memberKey: string, sessionId?: string | null, socketId?: string | null) {
  const suffix = sessionId?.trim() || socketId?.trim() || "shared";
  return `${memberKey}:${suffix}`.slice(0, 160);
}

export function getServiceRealtimeRoom(pageId: string, channelKey: string) {
  return `service:${pageId}:${normalizeServiceRealtimeChannelKey(channelKey)}`;
}

function mapChannel(channel: {
  id: string;
  key: string;
  topic: string;
  kind: string;
  config: unknown;
  message_limit: number;
  created_at: Date;
  updated_at: Date;
}): ServiceRealtimeChannelView {
  return {
    id: channel.id,
    key: channel.key,
    topic: channel.topic,
    kind: channel.kind,
    config: asObject(channel.config),
    messageLimit: channel.message_limit,
    createdAt: channel.created_at.toISOString(),
    updatedAt: channel.updated_at.toISOString(),
  };
}

function mapReceipt(receipt: {
  id: string;
  message_id: string;
  recipient_key: string;
  delivered_at: Date | null;
  read_at: Date | null;
}): ServiceRealtimeReceiptView {
  return {
    id: receipt.id,
    messageId: receipt.message_id,
    recipientKey: receipt.recipient_key,
    deliveredAt: receipt.delivered_at?.toISOString() ?? null,
    readAt: receipt.read_at?.toISOString() ?? null,
    state: receipt.read_at ? "read" : "delivered",
  };
}

function mapMessage(message: {
  id: string;
  type: string;
  sender_key: string;
  sender_name: string | null;
  message_key: string | null;
  body: unknown;
  meta: unknown;
  created_at: Date;
  channel?: { key: string };
  receipts?: Array<{
    id: string;
    message_id: string;
    recipient_key: string;
    delivered_at: Date | null;
    read_at: Date | null;
  }>;
}, fallbackChannelKey?: string): ServiceRealtimeMessageView {
  return {
    id: message.id,
    channelKey: message.channel?.key ?? fallbackChannelKey ?? "",
    type: message.type,
    senderKey: message.sender_key,
    senderName: message.sender_name,
    messageKey: message.message_key ?? null,
    body: message.body,
    meta: asObject(message.meta),
    createdAt: message.created_at.toISOString(),
    receipts: (message.receipts ?? []).map(mapReceipt),
  };
}

function mapPresence(presence: {
  id: string;
  connection_key: string;
  member_key: string;
  session_id: string | null;
  socket_id: string | null;
  name: string | null;
  status: string;
  meta: unknown;
  joined_at: Date;
  last_seen_at: Date;
  channel?: { key: string };
}, fallbackChannelKey?: string): ServiceRealtimePresenceView {
  return {
    id: presence.id,
    channelKey: presence.channel?.key ?? fallbackChannelKey ?? "",
    connectionKey: presence.connection_key,
    memberKey: presence.member_key,
    sessionId: presence.session_id,
    socketId: presence.socket_id,
    name: presence.name,
    status: (presence.status as ServiceRealtimePresenceStatus) ?? "online",
    meta: asObject(presence.meta),
    joinedAt: presence.joined_at.toISOString(),
    lastSeenAt: presence.last_seen_at.toISOString(),
  };
}

async function emitServiceRealtimeAudit(
  pageId: string,
  action: string,
  targetType: string,
  targetId: string,
  actor?: AppAuditActor,
  meta?: Record<string, unknown> | null,
) {
  await logAppAudit({
    pageId,
    action,
    targetType,
    targetId,
    actor,
    meta: meta ?? null,
  });
}

async function emitServiceRealtimeEvent(input: {
  pageId: string;
  channel: { key: string; topic: string };
  type: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}) {
  try {
    await publishServiceEvent({
      pageId: input.pageId,
      dispatch: false,
      envelope: {
        stream: "service-realtime",
        topic: input.channel.topic,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        source: "service-realtime",
        payload: {
          channelKey: input.channel.key,
          ...(input.payload ?? {}),
        },
        meta: input.meta ?? undefined,
      },
    });
  } catch {
    // best-effort event fan-out
  }
}

export async function ensureServiceRealtimeChannel(input: ServiceRealtimeChannelInput) {
  const key = normalizeServiceRealtimeChannelKey(input.key);
  if (!input.pageId || !key) {
    throw new Error("service_realtime_channel_invalid");
  }
  const topic = normalizeServiceRealtimeChannelKey(input.topic ?? key) || key;
  const kind = input.kind ?? "generic";
  return prisma.serviceRealtimeChannel.upsert({
    where: {
      page_id_key: {
        page_id: input.pageId,
        key,
      },
    },
    update: {
      topic,
      kind,
      config: (input.config ?? undefined) as Prisma.InputJsonValue | undefined,
      message_limit: clampMessageLimit(input.messageLimit),
    },
    create: {
      page_id: input.pageId,
      key,
      topic,
      kind,
      config: (input.config ?? undefined) as Prisma.InputJsonValue | undefined,
      message_limit: clampMessageLimit(input.messageLimit),
    },
  });
}

export async function listServiceRealtimeChannels(pageId: string) {
  const channels = await prisma.serviceRealtimeChannel.findMany({
    where: { page_id: pageId },
    orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
  });
  return channels.map(mapChannel);
}

export async function pruneServiceRealtimePresence(pageId: string, channelKey: string, ttlMs = DEFAULT_SERVICE_REALTIME_PRESENCE_TTL_MS) {
  const key = normalizeServiceRealtimeChannelKey(channelKey);
  if (!pageId || !key) return;
  const threshold = new Date(Date.now() - Math.max(5_000, ttlMs));
  await prisma.serviceRealtimePresence.deleteMany({
    where: {
      page_id: pageId,
      channel: { key },
      last_seen_at: { lt: threshold },
    },
  });
}

export async function listServiceRealtimePresence(input: {
  pageId: string;
  channelKey: string;
  ttlMs?: number;
}) {
  const key = normalizeServiceRealtimeChannelKey(input.channelKey);
  if (!input.pageId || !key) return [];
  await pruneServiceRealtimePresence(input.pageId, key, input.ttlMs);
  const presence = await prisma.serviceRealtimePresence.findMany({
    where: {
      page_id: input.pageId,
      channel: { key },
    },
    include: {
      channel: { select: { key: true } },
    },
    orderBy: [{ last_seen_at: "desc" }, { joined_at: "asc" }],
  });
  return presence.map((entry) => mapPresence(entry));
}

export async function replayServiceRealtimeMessages(input: {
  pageId: string;
  channelKey: string;
  afterId?: string | null;
  limit?: number;
}) {
  const key = normalizeServiceRealtimeChannelKey(input.channelKey);
  if (!input.pageId || !key) return [];

  let createdAfter: Date | null = null;
  if (input.afterId) {
    const pivot = await prisma.serviceRealtimeMessage.findFirst({
      where: {
        id: input.afterId,
        page_id: input.pageId,
        channel: { key },
      },
      select: { created_at: true },
    });
    createdAfter = pivot?.created_at ?? null;
  }

  const messages = await prisma.serviceRealtimeMessage.findMany({
    where: {
      page_id: input.pageId,
      channel: { key },
      ...(createdAfter ? { created_at: { gt: createdAfter } } : {}),
    },
    include: {
      channel: { select: { key: true } },
      receipts: {
        orderBy: { updated_at: "desc" },
      },
    },
    orderBy: { created_at: "asc" },
    take: Math.min(200, Math.max(1, input.limit ?? 50)),
  });
  return messages.map((entry) => mapMessage(entry));
}

export async function getServiceRealtimeSnapshot(input: {
  pageId: string;
  channelKey: string;
  ttlMs?: number;
  messageLimit?: number;
}) {
  const channel = await ensureServiceRealtimeChannel({
    pageId: input.pageId,
    key: input.channelKey,
    messageLimit: input.messageLimit,
  });
  const [messages, presence] = await Promise.all([
    replayServiceRealtimeMessages({
      pageId: input.pageId,
      channelKey: channel.key,
      limit: channel.message_limit,
    }),
    listServiceRealtimePresence({
      pageId: input.pageId,
      channelKey: channel.key,
      ttlMs: input.ttlMs,
    }),
  ]);
  return {
    channel: mapChannel(channel),
    messages,
    presence,
  } satisfies ServiceRealtimeSnapshot;
}

export async function upsertServiceRealtimePresence(input: ServiceRealtimePresenceInput) {
  const channel = await ensureServiceRealtimeChannel({
    pageId: input.pageId,
    key: input.channelKey,
    topic: input.topic,
    kind: input.kind ?? "presence",
  });
  const connectionKey = buildServiceRealtimeConnectionKey(input.memberKey, input.sessionId, input.socketId);
  const presence = await prisma.serviceRealtimePresence.upsert({
    where: {
      channel_id_connection_key: {
        channel_id: channel.id,
        connection_key: connectionKey,
      },
    },
    update: {
      member_key: input.memberKey,
      session_id: input.sessionId ?? null,
      socket_id: input.socketId ?? null,
      name: input.name ?? null,
      status: input.status ?? "online",
      meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      last_seen_at: new Date(),
    },
    create: {
      page_id: input.pageId,
      channel_id: channel.id,
      connection_key: connectionKey,
      member_key: input.memberKey,
      session_id: input.sessionId ?? null,
      socket_id: input.socketId ?? null,
      name: input.name ?? null,
      status: input.status ?? "online",
      meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      last_seen_at: new Date(),
    },
    include: {
      channel: { select: { key: true } },
    },
  });

  await emitServiceRealtimeAudit(input.pageId, "service_realtime_presence_upsert", "service_realtime_channel", channel.id, input.actor, {
    channelKey: channel.key,
    memberKey: input.memberKey,
    connectionKey,
    status: input.status ?? "online",
  });
  await emitServiceRealtimeEvent({
    pageId: input.pageId,
    channel: channel,
    type: "service.realtime.presence",
    entityType: "service_realtime_presence",
    entityId: presence.id,
    payload: {
      memberKey: input.memberKey,
      connectionKey,
      status: input.status ?? "online",
    },
  });

  return {
    channel: mapChannel(channel),
    presence: mapPresence(presence, channel.key),
  };
}

export async function leaveServiceRealtimeChannel(input: {
  pageId: string;
  channelKey: string;
  memberKey: string;
  sessionId?: string | null;
  socketId?: string | null;
  actor?: AppAuditActor;
}) {
  const channel = await prisma.serviceRealtimeChannel.findFirst({
    where: {
      page_id: input.pageId,
      key: normalizeServiceRealtimeChannelKey(input.channelKey),
    },
  });
  if (!channel) {
    return { removed: false, connectionKey: buildServiceRealtimeConnectionKey(input.memberKey, input.sessionId, input.socketId) };
  }
  const connectionKey = buildServiceRealtimeConnectionKey(input.memberKey, input.sessionId, input.socketId);
  const deleted = await prisma.serviceRealtimePresence.deleteMany({
    where: {
      page_id: input.pageId,
      channel_id: channel.id,
      connection_key: connectionKey,
    },
  });
  if (deleted.count > 0) {
    await emitServiceRealtimeAudit(input.pageId, "service_realtime_presence_leave", "service_realtime_channel", channel.id, input.actor, {
      channelKey: channel.key,
      memberKey: input.memberKey,
      connectionKey,
    });
    await emitServiceRealtimeEvent({
      pageId: input.pageId,
      channel,
      type: "service.realtime.presence.left",
      entityType: "service_realtime_presence",
      entityId: connectionKey,
      payload: {
        memberKey: input.memberKey,
        connectionKey,
      },
    });
  }
  return { removed: deleted.count > 0, connectionKey };
}

export async function publishServiceRealtimeMessage(input: ServiceRealtimeMessageInput) {
  const channel = await ensureServiceRealtimeChannel({
    pageId: input.pageId,
    key: input.channelKey,
    topic: input.topic,
    kind: input.kind ?? "chat",
  });

  if (input.messageKey) {
    const existing = await prisma.serviceRealtimeMessage.findFirst({
      where: {
        page_id: input.pageId,
        channel_id: channel.id,
        sender_key: input.senderKey,
        message_key: input.messageKey,
      },
      include: {
        channel: { select: { key: true } },
        receipts: { orderBy: { updated_at: "desc" } },
      },
    });
    if (existing) {
      return {
        channel: mapChannel(channel),
        message: mapMessage(existing),
        deduped: true,
      };
    }
  }

  const message = await prisma.serviceRealtimeMessage.create({
    data: {
      page_id: input.pageId,
      channel_id: channel.id,
      message_key: input.messageKey ?? null,
      type: input.type ?? "message",
      sender_key: input.senderKey,
      sender_name: input.senderName ?? null,
      body: input.body as Prisma.InputJsonValue | undefined,
      meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    include: {
      channel: { select: { key: true } },
      receipts: { orderBy: { updated_at: "desc" } },
    },
  });

  await emitServiceRealtimeAudit(input.pageId, "service_realtime_message_publish", "service_realtime_channel", channel.id, input.actor, {
    channelKey: channel.key,
    messageId: message.id,
    senderKey: input.senderKey,
    type: input.type ?? "message",
  });
  await emitServiceRealtimeEvent({
    pageId: input.pageId,
    channel,
    type: "service.realtime.message",
    entityType: "service_realtime_message",
    entityId: message.id,
    payload: {
      senderKey: input.senderKey,
      messageType: input.type ?? "message",
    },
  });

  return {
    channel: mapChannel(channel),
    message: mapMessage(message, channel.key),
    deduped: false,
  };
}

export async function ackServiceRealtimeMessage(input: ServiceRealtimeAckInput) {
  const key = normalizeServiceRealtimeChannelKey(input.channelKey);
  const message = await prisma.serviceRealtimeMessage.findFirst({
    where: {
      id: input.messageId,
      page_id: input.pageId,
      channel: { key },
    },
    include: {
      channel: true,
      receipts: { orderBy: { updated_at: "desc" } },
    },
  });
  if (!message) {
    throw new Error("service_realtime_message_not_found");
  }
  const now = new Date();
  const receipt = await prisma.serviceRealtimeReceipt.upsert({
    where: {
      message_id_recipient_key: {
        message_id: message.id,
        recipient_key: input.recipientKey,
      },
    },
    update: {
      channel_id: message.channel_id,
      page_id: input.pageId,
      delivered_at: input.state === "delivered" ? now : undefined,
      read_at: input.state === "read" ? now : undefined,
    },
    create: {
      page_id: input.pageId,
      channel_id: message.channel_id,
      message_id: message.id,
      recipient_key: input.recipientKey,
      delivered_at: now,
      read_at: input.state === "read" ? now : null,
    },
  });

  await emitServiceRealtimeAudit(input.pageId, "service_realtime_receipt_ack", "service_realtime_message", message.id, input.actor, {
    channelKey: message.channel.key,
    recipientKey: input.recipientKey,
    state: input.state,
  });
  await emitServiceRealtimeEvent({
    pageId: input.pageId,
    channel: message.channel,
    type: "service.realtime.receipt",
    entityType: "service_realtime_receipt",
    entityId: receipt.id,
    payload: {
      messageId: message.id,
      recipientKey: input.recipientKey,
      state: input.state,
    },
  });

  return mapReceipt({
    id: receipt.id,
    message_id: receipt.message_id,
    recipient_key: receipt.recipient_key,
    delivered_at: receipt.delivered_at,
    read_at: receipt.read_at,
  });
}
