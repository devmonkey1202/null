// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  serviceRealtimeChannel: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  serviceRealtimePresence: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  serviceRealtimeMessage: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  serviceRealtimeReceipt: {
    upsert: vi.fn(),
  },
}));

const logAppAuditMock = vi.hoisted(() => vi.fn());
const publishServiceEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: logAppAuditMock }));
vi.mock("@/lib/service-event-bus", () => ({ publishServiceEvent: publishServiceEventMock }));

import {
  ackServiceRealtimeMessage,
  getServiceRealtimeSnapshot,
  leaveServiceRealtimeChannel,
  publishServiceRealtimeMessage,
  replayServiceRealtimeMessages,
  upsertServiceRealtimePresence,
} from "@/lib/service-realtime";

describe("service realtime", () => {
  beforeEach(() => {
    prismaMock.serviceRealtimeChannel.upsert.mockReset();
    prismaMock.serviceRealtimeChannel.findFirst.mockReset();
    prismaMock.serviceRealtimeChannel.findMany.mockReset();
    prismaMock.serviceRealtimePresence.upsert.mockReset();
    prismaMock.serviceRealtimePresence.findMany.mockReset();
    prismaMock.serviceRealtimePresence.deleteMany.mockReset();
    prismaMock.serviceRealtimeMessage.findFirst.mockReset();
    prismaMock.serviceRealtimeMessage.findMany.mockReset();
    prismaMock.serviceRealtimeMessage.create.mockReset();
    prismaMock.serviceRealtimeReceipt.upsert.mockReset();
    logAppAuditMock.mockReset();
    publishServiceEventMock.mockReset();
  });

  it("upserts presence and returns recovery snapshot", async () => {
    prismaMock.serviceRealtimeChannel.upsert.mockResolvedValue({
      id: "channel_1",
      page_id: "page_1",
      key: "chat-general",
      topic: "chat-general",
      kind: "chat",
      config: null,
      message_limit: 100,
      created_at: new Date("2026-03-23T00:00:00.000Z"),
      updated_at: new Date("2026-03-23T00:00:00.000Z"),
    });
    prismaMock.serviceRealtimePresence.upsert.mockResolvedValue({
      id: "presence_1",
      connection_key: "alice:tab-1",
      member_key: "alice",
      session_id: "tab-1",
      socket_id: "socket_1",
      name: "Alice",
      status: "online",
      meta: { role: "host" },
      joined_at: new Date("2026-03-23T00:00:00.000Z"),
      last_seen_at: new Date("2026-03-23T00:00:05.000Z"),
      channel: { key: "chat-general" },
    });
    prismaMock.serviceRealtimePresence.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.serviceRealtimePresence.findMany.mockResolvedValue([
      {
        id: "presence_1",
        connection_key: "alice:tab-1",
        member_key: "alice",
        session_id: "tab-1",
        socket_id: "socket_1",
        name: "Alice",
        status: "online",
        meta: { role: "host" },
        joined_at: new Date("2026-03-23T00:00:00.000Z"),
        last_seen_at: new Date("2026-03-23T00:00:05.000Z"),
        channel: { key: "chat-general" },
      },
    ]);
    prismaMock.serviceRealtimeMessage.findMany.mockResolvedValue([]);

    const joined = await upsertServiceRealtimePresence({
      pageId: "page_1",
      channelKey: "chat-general",
      kind: "chat",
      memberKey: "alice",
      sessionId: "tab-1",
      socketId: "socket_1",
      name: "Alice",
      status: "online",
      meta: { role: "host" },
    });
    const snapshot = await getServiceRealtimeSnapshot({
      pageId: "page_1",
      channelKey: "chat-general",
    });

    expect(joined.channel.key).toBe("chat-general");
    expect(joined.presence.memberKey).toBe("alice");
    expect(snapshot.presence).toHaveLength(1);
    expect(snapshot.presence[0]?.connectionKey).toBe("alice:tab-1");
    expect(publishServiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page_1",
        envelope: expect.objectContaining({ type: "service.realtime.presence" }),
      }),
    );
  });

  it("publishes service messages and dedupes by message key", async () => {
    prismaMock.serviceRealtimeChannel.upsert.mockResolvedValue({
      id: "channel_1",
      page_id: "page_1",
      key: "ops-room",
      topic: "ops-room",
      kind: "chat",
      config: null,
      message_limit: 100,
      created_at: new Date("2026-03-23T00:00:00.000Z"),
      updated_at: new Date("2026-03-23T00:00:00.000Z"),
    });
    prismaMock.serviceRealtimeMessage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "message_1",
        type: "message",
        sender_key: "alice",
        sender_name: "Alice",
        message_key: "msg-1",
        body: { text: "hello" },
        meta: null,
        created_at: new Date("2026-03-23T00:00:10.000Z"),
        channel: { key: "ops-room" },
        receipts: [],
      });
    prismaMock.serviceRealtimeMessage.create.mockResolvedValue({
      id: "message_1",
      type: "message",
      sender_key: "alice",
      sender_name: "Alice",
      message_key: "msg-1",
      body: { text: "hello" },
      meta: null,
      created_at: new Date("2026-03-23T00:00:10.000Z"),
      channel: { key: "ops-room" },
      receipts: [],
    });

    const first = await publishServiceRealtimeMessage({
      pageId: "page_1",
      channelKey: "ops-room",
      kind: "chat",
      senderKey: "alice",
      senderName: "Alice",
      messageKey: "msg-1",
      body: { text: "hello" },
    });
    const second = await publishServiceRealtimeMessage({
      pageId: "page_1",
      channelKey: "ops-room",
      kind: "chat",
      senderKey: "alice",
      senderName: "Alice",
      messageKey: "msg-1",
      body: { text: "hello" },
    });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(prismaMock.serviceRealtimeMessage.create).toHaveBeenCalledTimes(1);
    expect(publishServiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page_1",
        envelope: expect.objectContaining({ type: "service.realtime.message" }),
      }),
    );
  });

  it("replays messages after a pivot and records receipt acknowledgements", async () => {
    prismaMock.serviceRealtimeMessage.findFirst
      .mockResolvedValueOnce({
        created_at: new Date("2026-03-23T00:00:05.000Z"),
      })
      .mockResolvedValueOnce({
        id: "message_9",
        page_id: "page_1",
        channel_id: "channel_1",
        channel: {
          id: "channel_1",
          key: "ops-room",
          topic: "ops-room",
          kind: "chat",
        },
        receipts: [],
      });
    prismaMock.serviceRealtimeMessage.findMany.mockResolvedValue([
      {
        id: "message_10",
        type: "system",
        sender_key: "system",
        sender_name: "System",
        message_key: null,
        body: { status: "ok" },
        meta: null,
        created_at: new Date("2026-03-23T00:00:09.000Z"),
        channel: { key: "ops-room" },
        receipts: [],
      },
    ]);
    prismaMock.serviceRealtimeReceipt.upsert.mockResolvedValue({
      id: "receipt_1",
      message_id: "message_9",
      recipient_key: "alice",
      delivered_at: new Date("2026-03-23T00:00:10.000Z"),
      read_at: new Date("2026-03-23T00:00:11.000Z"),
    });

    const replayed = await replayServiceRealtimeMessages({
      pageId: "page_1",
      channelKey: "ops-room",
      afterId: "message_5",
      limit: 20,
    });
    const receipt = await ackServiceRealtimeMessage({
      pageId: "page_1",
      channelKey: "ops-room",
      messageId: "message_9",
      recipientKey: "alice",
      state: "read",
    });

    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.id).toBe("message_10");
    expect(receipt.state).toBe("read");
    expect(receipt.recipientKey).toBe("alice");
    expect(publishServiceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page_1",
        envelope: expect.objectContaining({ type: "service.realtime.receipt" }),
      }),
    );
  });

  it("removes presence bindings on leave", async () => {
    prismaMock.serviceRealtimeChannel.findFirst.mockResolvedValue({
      id: "channel_1",
      page_id: "page_1",
      key: "ops-room",
      topic: "ops-room",
      kind: "chat",
    });
    prismaMock.serviceRealtimePresence.deleteMany.mockResolvedValue({ count: 1 });

    const result = await leaveServiceRealtimeChannel({
      pageId: "page_1",
      channelKey: "ops-room",
      memberKey: "alice",
      sessionId: "tab-1",
      socketId: "socket_1",
    });

    expect(result.removed).toBe(true);
    expect(result.connectionKey).toBe("alice:tab-1");
  });
});
