import { beforeEach, describe, expect, it, vi } from "vitest";

type NotificationRow = {
  id: string;
  page_id: string;
  recipient_key: string;
  recipient_label: string | null;
  app_user_id: string | null;
  type: string;
  topic: string;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  delivery_channels: string[] | null;
  source_type: string | null;
  source_id: string | null;
  status: string;
  scheduled_for: Date;
  sent_at: Date | null;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type PreferenceRow = {
  id: string;
  page_id: string;
  recipient_key: string;
  channel: string;
  topic: string;
  enabled: boolean;
  muted_until: Date | null;
  config: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type DeliveryRow = {
  id: string;
  page_id: string;
  notification_id: string;
  channel: string;
  provider: string | null;
  status: string;
  error: string | null;
  meta: Record<string, unknown> | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const state = vi.hoisted(() => ({
  notifications: [] as NotificationRow[],
  preferences: [] as PreferenceRow[],
  deliveries: [] as DeliveryRow[],
  seq: 0,
}));

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

const prismaMock = vi.hoisted(() => ({
  serviceNotification: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: NotificationRow = {
        id: nextId("notif"),
        page_id: String(data.page_id),
        recipient_key: String(data.recipient_key),
        recipient_label: (data.recipient_label as string | null) ?? null,
        app_user_id: (data.app_user_id as string | null) ?? null,
        type: String(data.type ?? "generic"),
        topic: String(data.topic ?? "general"),
        title: (data.title as string | null) ?? null,
        body: (data.body as string | null) ?? null,
        payload: (data.payload as Record<string, unknown> | null) ?? null,
        delivery_channels: (data.delivery_channels as string[] | null) ?? null,
        source_type: (data.source_type as string | null) ?? null,
        source_id: (data.source_id as string | null) ?? null,
        status: String(data.status ?? "queued"),
        scheduled_for: (data.scheduled_for as Date) ?? new Date(),
        sent_at: null,
        read_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.notifications.push(row);
      return row;
    }),
    findMany: vi.fn(async ({ where, orderBy, take, skip }: { where?: Record<string, unknown>; orderBy?: Array<Record<string, "asc" | "desc">>; take?: number; skip?: number }) => {
      let rows = [...state.notifications];
      if (where?.page_id) rows = rows.filter((row) => row.page_id === where.page_id);
      if (where?.recipient_key) rows = rows.filter((row) => row.recipient_key === where.recipient_key);
      if (where?.status) rows = rows.filter((row) => row.status === where.status);
      if (where?.id && typeof where.id === "object" && where.id && "in" in where.id) {
        const ids = new Set((where.id as { in: string[] }).in);
        rows = rows.filter((row) => ids.has(row.id));
      }
      if (where?.topic) rows = rows.filter((row) => row.topic === where.topic);
      if (where?.read_at === null) rows = rows.filter((row) => row.read_at === null);
      if (where?.scheduled_for && typeof where.scheduled_for === "object" && where.scheduled_for && "lte" in where.scheduled_for) {
        const lte = (where.scheduled_for as { lte: Date }).lte.getTime();
        rows = rows.filter((row) => row.scheduled_for.getTime() <= lte);
      }
      if (Array.isArray(orderBy)) {
        rows.sort((a, b) => {
          for (const entry of orderBy) {
            const [key, dir] = Object.entries(entry)[0] as [keyof NotificationRow, "asc" | "desc"];
            const av = a[key];
            const bv = b[key];
            const cmp = av instanceof Date && bv instanceof Date ? av.getTime() - bv.getTime() : String(av).localeCompare(String(bv));
            if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
          }
          return 0;
        });
      }
      const start = skip ?? 0;
      const end = take ? start + take : undefined;
      return rows.slice(start, end);
    }),
    count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      let rows = [...state.notifications];
      if (where?.page_id) rows = rows.filter((row) => row.page_id === where.page_id);
      if (where?.recipient_key) rows = rows.filter((row) => row.recipient_key === where.recipient_key);
      if (where?.topic) rows = rows.filter((row) => row.topic === where.topic);
      if (where?.read_at === null) rows = rows.filter((row) => row.read_at === null);
      return rows.length;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.notifications.find((item) => item.id === where.id);
      if (!row) throw new Error("notification_not_found");
      Object.assign(row, data, { updated_at: new Date() });
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of state.notifications) {
        if (row.id !== where.id || row.page_id !== where.page_id || row.recipient_key !== where.recipient_key) continue;
        Object.assign(row, data, { updated_at: new Date() });
        count += 1;
      }
      return { count };
    }),
  },
  serviceNotificationPreference: {
    upsert: vi.fn(async ({ where, update, create }: { where: { page_id_recipient_key_channel_topic: { page_id: string; recipient_key: string; channel: string; topic: string } }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
      const key = where.page_id_recipient_key_channel_topic;
      let row = state.preferences.find(
        (item) =>
          item.page_id === key.page_id &&
          item.recipient_key === key.recipient_key &&
          item.channel === key.channel &&
          item.topic === key.topic,
      );
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return row;
      }
      row = {
        id: nextId("pref"),
        page_id: String(create.page_id),
        recipient_key: String(create.recipient_key),
        channel: String(create.channel),
        topic: String(create.topic),
        enabled: Boolean(create.enabled ?? true),
        muted_until: (create.muted_until as Date | null) ?? null,
        config: (create.config as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.preferences.push(row);
      return row;
    }),
    findMany: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">> }) => {
      let rows = [...state.preferences];
      if (where?.page_id) rows = rows.filter((row) => row.page_id === where.page_id);
      if (where?.recipient_key) rows = rows.filter((row) => row.recipient_key === where.recipient_key);
      if (where?.channel && typeof where.channel === "object" && where.channel && "in" in where.channel) {
        const channels = new Set((where.channel as { in: string[] }).in);
        rows = rows.filter((row) => channels.has(row.channel));
      }
      if (where?.topic && typeof where.topic === "object" && where.topic && "in" in where.topic) {
        const topics = new Set((where.topic as { in: string[] }).in);
        rows = rows.filter((row) => topics.has(row.topic));
      }
      const entries = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
      if (entries.length) {
        rows.sort((a, b) => {
          for (const entry of entries) {
            const [key, dir] = Object.entries(entry)[0] as [keyof PreferenceRow, "asc" | "desc"];
            const cmp = String(a[key]).localeCompare(String(b[key]));
            if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
          }
          return 0;
        });
      }
      return rows;
    }),
  },
  serviceNotificationDelivery: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: DeliveryRow = {
        id: nextId("delivery"),
        page_id: String(data.page_id),
        notification_id: String(data.notification_id),
        channel: String(data.channel),
        provider: (data.provider as string | null) ?? null,
        status: String(data.status ?? "queued"),
        error: (data.error as string | null) ?? null,
        meta: (data.meta as Record<string, unknown> | null) ?? null,
        delivered_at: (data.delivered_at as Date | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.deliveries.push(row);
      return row;
    }),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/background-jobs", () => ({ enqueueJob: vi.fn() }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: vi.fn() }));
vi.mock("@/lib/service-runtime", () => ({ registerBackgroundJobHandler: vi.fn() }));

import { enqueueJob } from "@/lib/background-jobs";
import {
  appUserRecipientKey,
  dispatchQueuedServiceNotifications,
  listServiceNotifications,
  markServiceNotificationRead,
  queueServiceNotifications,
  upsertServiceNotificationPreference,
} from "@/lib/service-notifications";

describe("service notifications", () => {
  beforeEach(() => {
    state.notifications = [];
    state.preferences = [];
    state.deliveries = [];
    state.seq = 0;
    vi.clearAllMocks();
  });

  it("queues notifications from templates and schedules dispatch", async () => {
    const result = await queueServiceNotifications({
      pageId: "page1",
      recipients: [{ recipientKey: appUserRecipientKey("app_user_1"), appUserId: "app_user_1" }],
      topic: "orders",
      type: "order_created",
      titleTemplate: "주문 {{orderId}}",
      bodyTemplate: "{{customer}} 주문이 생성되었습니다.",
      variables: { orderId: "A-100", customer: "홍길동" },
      channels: ["in_app", "email"],
    });

    expect(result.count).toBe(1);
    expect(state.notifications[0]?.title).toBe("주문 A-100");
    expect(state.notifications[0]?.body).toBe("홍길동 주문이 생성되었습니다.");
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("dispatches notifications and honors muted preferences", async () => {
    await upsertServiceNotificationPreference({
      pageId: "page1",
      recipientKey: appUserRecipientKey("app_user_1"),
      channel: "email",
      topic: "orders",
      enabled: true,
      mutedUntil: new Date("2026-03-24T00:00:00.000Z"),
    });
    await queueServiceNotifications({
      pageId: "page1",
      recipients: [{ recipientKey: appUserRecipientKey("app_user_1"), appUserId: "app_user_1" }],
      topic: "orders",
      title: "주문 생성",
      body: "본문",
      channels: ["in_app", "email"],
      scheduledFor: new Date("2026-03-23T11:00:00.000Z"),
      autoDispatch: false,
    });

    const result = await dispatchQueuedServiceNotifications({
      pageId: "page1",
      now: new Date("2026-03-23T12:00:00.000Z"),
    });

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(state.deliveries).toHaveLength(2);
    expect(state.deliveries.find((row) => row.channel === "in_app")?.status).toBe("sent");
    expect(state.deliveries.find((row) => row.channel === "email")?.status).toBe("skipped");
    expect(state.notifications[0]?.status).toBe("sent");
  });

  it("lists notifications and marks them read", async () => {
    await queueServiceNotifications({
      pageId: "page1",
      recipients: [{ recipientKey: appUserRecipientKey("app_user_1"), appUserId: "app_user_1" }],
      topic: "general",
      title: "새 알림",
      body: "본문",
      autoDispatch: false,
    });

    const list = await listServiceNotifications({
      pageId: "page1",
      recipientKey: appUserRecipientKey("app_user_1"),
      unreadOnly: true,
    });
    expect(list.total).toBe(1);

    const marked = await markServiceNotificationRead({
      pageId: "page1",
      notificationId: state.notifications[0].id,
      recipientKey: appUserRecipientKey("app_user_1"),
    });

    expect(marked.ok).toBe(true);
    expect(state.notifications[0].read_at).not.toBeNull();
  });
});
