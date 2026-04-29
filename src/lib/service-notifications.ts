import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/background-jobs";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { registerBackgroundJobHandler } from "@/lib/service-runtime";

export type ServiceNotificationChannel = "in_app" | "email" | "push" | "sms";

export type ServiceNotificationRecipient = {
  recipientKey: string;
  recipientLabel?: string | null;
  appUserId?: string | null;
};

export type ServiceNotificationAdapterInput = {
  pageId: string;
  notificationId: string;
  recipientKey: string;
  recipientLabel?: string | null;
  channel: Exclude<ServiceNotificationChannel, "in_app">;
  topic: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

export type ServiceNotificationAdapterResult = {
  ok: boolean;
  provider?: string | null;
  error?: string | null;
  meta?: Record<string, unknown> | null;
};

type PersistedNotification = {
  id: string;
  page_id: string;
  recipient_key: string;
  recipient_label: string | null;
  app_user_id: string | null;
  type: string;
  topic: string;
  title: string | null;
  body: string | null;
  payload: Prisma.JsonValue | null;
  delivery_channels: Prisma.JsonValue | null;
  source_type: string | null;
  source_id: string | null;
  status: string;
  scheduled_for: Date;
  sent_at: Date | null;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type PersistedPreference = {
  id: string;
  page_id: string;
  recipient_key: string;
  channel: string;
  topic: string;
  enabled: boolean;
  muted_until: Date | null;
  config: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
};

type NotificationDispatchSummary = {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
};

const notificationAdapters = new Map<
  Exclude<ServiceNotificationChannel, "in_app">,
  (input: ServiceNotificationAdapterInput) => Promise<ServiceNotificationAdapterResult>
>();

function normalizePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function interpolateTemplate(template: string | undefined, variables: Record<string, unknown>) {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  });
}

function normalizeChannels(value?: ServiceNotificationChannel[]) {
  const raw = Array.isArray(value) ? value : ["in_app"];
  const normalized = raw.filter((channel): channel is ServiceNotificationChannel =>
    channel === "in_app" || channel === "email" || channel === "push" || channel === "sms",
  );
  return normalized.length ? Array.from(new Set(normalized)) : (["in_app"] as ServiceNotificationChannel[]);
}

function normalizeRecipient(recipient: ServiceNotificationRecipient) {
  return {
    recipientKey: recipient.recipientKey.trim(),
    recipientLabel: recipient.recipientLabel?.trim() || null,
    appUserId: recipient.appUserId ?? null,
  };
}

function normalizePreferenceConfig(value: unknown) {
  return normalizePayload(value) as Prisma.InputJsonValue;
}

function defaultAdapter(channel: Exclude<ServiceNotificationChannel, "in_app">) {
  return async (input: ServiceNotificationAdapterInput): Promise<ServiceNotificationAdapterResult> => ({
    ok: true,
    provider: `default_${channel}`,
    meta: {
      recipientKey: input.recipientKey,
      topic: input.topic,
    },
  });
}

notificationAdapters.set("email", defaultAdapter("email"));
notificationAdapters.set("push", defaultAdapter("push"));
notificationAdapters.set("sms", defaultAdapter("sms"));

export function registerServiceNotificationAdapter(
  channel: Exclude<ServiceNotificationChannel, "in_app">,
  adapter: (input: ServiceNotificationAdapterInput) => Promise<ServiceNotificationAdapterResult>,
) {
  notificationAdapters.set(channel, adapter);
}

export function appUserRecipientKey(appUserId: string) {
  return `app_user:${appUserId}`;
}

export async function upsertServiceNotificationPreference(input: {
  pageId: string;
  recipientKey: string;
  channel: ServiceNotificationChannel;
  topic?: string;
  enabled?: boolean;
  mutedUntil?: Date | null;
  config?: Record<string, unknown>;
  actor?: AppAuditActor;
}) {
  const topic = input.topic?.trim() || "*";
  const preference = await prisma.serviceNotificationPreference.upsert({
    where: {
      page_id_recipient_key_channel_topic: {
        page_id: input.pageId,
        recipient_key: input.recipientKey,
        channel: input.channel,
        topic,
      },
    },
    update: {
      enabled: input.enabled ?? true,
      muted_until: input.mutedUntil ?? null,
      config: normalizePreferenceConfig(input.config),
    },
    create: {
      page_id: input.pageId,
      recipient_key: input.recipientKey,
      channel: input.channel,
      topic,
      enabled: input.enabled ?? true,
      muted_until: input.mutedUntil ?? null,
      config: normalizePreferenceConfig(input.config),
    },
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_notification_preference_upsert",
    targetType: "service_notification_preference",
    targetId: preference.id,
    actor: input.actor,
    meta: {
      recipientKey: input.recipientKey,
      channel: input.channel,
      topic,
      enabled: preference.enabled,
      mutedUntil: preference.muted_until?.toISOString() ?? null,
    },
  });
  return preference;
}

export async function listServiceNotificationPreferences(pageId: string, recipientKey: string) {
  return prisma.serviceNotificationPreference.findMany({
    where: { page_id: pageId, recipient_key: recipientKey },
    orderBy: [{ channel: "asc" }, { topic: "asc" }],
  });
}

function resolvePreference(
  preferences: PersistedPreference[],
  channel: ServiceNotificationChannel,
  topic: string,
  now: Date,
) {
  const exact =
    preferences.find((preference) => preference.channel === channel && preference.topic === topic) ??
    preferences.find((preference) => preference.channel === channel && preference.topic === "*");
  if (!exact) return { enabled: true, muted: false };
  const muted = Boolean(exact.muted_until && exact.muted_until.getTime() > now.getTime());
  return { enabled: exact.enabled, muted };
}

export async function queueServiceNotifications(input: {
  pageId: string;
  recipients: ServiceNotificationRecipient[];
  type?: string;
  topic?: string;
  title?: string;
  body?: string;
  titleTemplate?: string;
  bodyTemplate?: string;
  variables?: Record<string, unknown>;
  channels?: ServiceNotificationChannel[];
  payload?: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
  scheduledFor?: Date | null;
  autoDispatch?: boolean;
  actor?: AppAuditActor;
}) {
  const variables = normalizePayload(input.variables);
  const title = input.title?.trim() || interpolateTemplate(input.titleTemplate, variables);
  const body = input.body?.trim() || interpolateTemplate(input.bodyTemplate, variables);
  const channels = normalizeChannels(input.channels);
  const scheduledFor = input.scheduledFor ?? new Date();
  const recipients = input.recipients
    .map(normalizeRecipient)
    .filter((recipient) => recipient.recipientKey);

  const created: PersistedNotification[] = [];
  for (const recipient of recipients) {
    const notification = (await prisma.serviceNotification.create({
      data: {
        page_id: input.pageId,
        recipient_key: recipient.recipientKey,
        recipient_label: recipient.recipientLabel,
        app_user_id: recipient.appUserId,
        type: input.type?.trim() || "generic",
        topic: input.topic?.trim() || "general",
        title: title || null,
        body: body || null,
        payload: (input.payload ?? variables) as Prisma.InputJsonValue,
        delivery_channels: channels as unknown as Prisma.InputJsonValue,
        source_type: input.sourceType ?? null,
        source_id: input.sourceId ?? null,
        scheduled_for: scheduledFor,
      },
    })) as PersistedNotification;
    created.push(notification);
  }

  if (created.length && input.autoDispatch !== false) {
    await scheduleServiceNotificationDispatch({
      pageId: input.pageId,
      notificationIds: created.map((notification) => notification.id),
      runAt: scheduledFor,
    });
  }

  await logAppAudit({
    pageId: input.pageId,
    action: "service_notification_queue",
    targetType: "service_notification",
    targetId: created.map((notification) => notification.id).join(","),
    actor: input.actor,
    meta: {
      topic: input.topic?.trim() || "general",
      type: input.type?.trim() || "generic",
      channels,
      count: created.length,
    },
  });

  return {
    items: created,
    count: created.length,
  };
}

export async function scheduleServiceNotificationDispatch(input: {
  pageId: string;
  notificationIds?: string[];
  runAt?: Date;
}) {
  await enqueueJob({
    pageId: input.pageId,
    queue: "notifications",
    type: "service-notification-dispatch",
    payload: {
      notificationIds: input.notificationIds ?? null,
    },
    runAt: input.runAt,
    priority: 95,
    dedupeKey: input.notificationIds?.length
      ? `service-notification-dispatch:${input.pageId}:${input.notificationIds.slice().sort().join(",")}`
      : `service-notification-dispatch:${input.pageId}:all`,
    maxAttempts: 3,
  });
}

export async function dispatchQueuedServiceNotifications(input: {
  pageId?: string;
  notificationIds?: string[];
  limit?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const limit = Number.isFinite(input.limit) ? Math.min(Math.max(Number(input.limit), 1), 100) : 50;
  const notifications = (await prisma.serviceNotification.findMany({
    where: {
      ...(input.pageId ? { page_id: input.pageId } : {}),
      ...(input.notificationIds?.length ? { id: { in: input.notificationIds } } : {}),
      status: "queued",
      scheduled_for: { lte: now },
    },
    orderBy: [{ scheduled_for: "asc" }, { created_at: "asc" }],
    take: limit,
  })) as PersistedNotification[];

  const summary: NotificationDispatchSummary = { queued: notifications.length, sent: 0, failed: 0, skipped: 0 };
  for (const notification of notifications) {
    const preferences = (await prisma.serviceNotificationPreference.findMany({
      where: {
        page_id: notification.page_id,
        recipient_key: notification.recipient_key,
        channel: {
          in: normalizeChannels((notification.delivery_channels as ServiceNotificationChannel[]) ?? ["in_app"]),
        },
        topic: { in: [notification.topic, "*"] },
      },
      orderBy: { updated_at: "desc" },
    })) as PersistedPreference[];
    const channels = normalizeChannels((notification.delivery_channels as ServiceNotificationChannel[]) ?? ["in_app"]);
    let sentCount = 0;
    let failedCount = 0;
    for (const channel of channels) {
      const preference = resolvePreference(preferences, channel, notification.topic, now);
      if (!preference.enabled || preference.muted) {
        await prisma.serviceNotificationDelivery.create({
          data: {
            page_id: notification.page_id,
            notification_id: notification.id,
            channel,
            provider: `preference_${channel}`,
            status: "skipped",
            meta: { muted: preference.muted, enabled: preference.enabled } as Prisma.InputJsonValue,
          },
        });
        continue;
      }

      if (channel === "in_app") {
        sentCount += 1;
        await prisma.serviceNotificationDelivery.create({
          data: {
            page_id: notification.page_id,
            notification_id: notification.id,
            channel,
            provider: "in_app",
            status: "sent",
            delivered_at: now,
          },
        });
        continue;
      }

      const adapter = notificationAdapters.get(channel);
      const result = adapter
        ? await adapter({
            pageId: notification.page_id,
            notificationId: notification.id,
            recipientKey: notification.recipient_key,
            recipientLabel: notification.recipient_label,
            channel,
            topic: notification.topic,
            type: notification.type,
            title: notification.title ?? "",
            body: notification.body ?? "",
            payload: normalizePayload(notification.payload),
          })
        : { ok: false, error: "adapter_not_found", provider: null, meta: null };

      if (result.ok) sentCount += 1;
      else failedCount += 1;

      await prisma.serviceNotificationDelivery.create({
        data: {
          page_id: notification.page_id,
          notification_id: notification.id,
          channel,
          provider: result.provider ?? null,
          status: result.ok ? "sent" : "failed",
          error: result.error ?? null,
          meta: (result.meta ?? {}) as Prisma.InputJsonValue,
          delivered_at: result.ok ? now : null,
        },
      });
    }

    const nextStatus =
      failedCount > 0 && sentCount > 0
        ? "partial"
        : failedCount > 0
          ? "failed"
          : sentCount > 0
            ? "sent"
            : "skipped";

    await prisma.serviceNotification.update({
      where: { id: notification.id },
      data: {
        status: nextStatus,
        sent_at: sentCount > 0 ? now : null,
      },
    });

    if (nextStatus === "sent" || nextStatus === "partial") summary.sent += 1;
    else if (nextStatus === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }

  return summary;
}

export async function listServiceNotifications(input: {
  pageId: string;
  recipientKey: string;
  unreadOnly?: boolean;
  topic?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Number.isFinite(input.limit) ? Math.min(Math.max(Number(input.limit), 1), 100) : 20;
  const offset = Number.isFinite(input.offset) ? Math.max(Number(input.offset), 0) : 0;
  const where = {
    page_id: input.pageId,
    recipient_key: input.recipientKey,
    ...(input.unreadOnly ? { read_at: null } : {}),
    ...(input.topic?.trim() ? { topic: input.topic.trim() } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.serviceNotification.findMany({
      where,
      orderBy: [{ created_at: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.serviceNotification.count({ where }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      topic: row.topic,
      title: row.title,
      body: row.body,
      status: row.status,
      readAt: row.read_at?.toISOString() ?? null,
      sentAt: row.sent_at?.toISOString() ?? null,
      payload: normalizePayload(row.payload),
      channels: normalizeChannels((row.delivery_channels as ServiceNotificationChannel[]) ?? ["in_app"]),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    })),
    total,
    limit,
    offset,
  };
}

export async function markServiceNotificationRead(input: {
  pageId: string;
  notificationId: string;
  recipientKey: string;
  actor?: AppAuditActor;
}) {
  const now = new Date();
  const updated = await prisma.serviceNotification.updateMany({
    where: {
      id: input.notificationId,
      page_id: input.pageId,
      recipient_key: input.recipientKey,
    },
    data: {
      read_at: now,
    },
  });
  if (updated.count) {
    await logAppAudit({
      pageId: input.pageId,
      action: "service_notification_read",
      targetType: "service_notification",
      targetId: input.notificationId,
      actor: input.actor,
      meta: { recipientKey: input.recipientKey },
    });
  }
  return { ok: updated.count > 0, readAt: now.toISOString() };
}

registerBackgroundJobHandler("service-notification-dispatch", async (job) => {
  const payload = normalizePayload(job.payload);
  const notificationIds = Array.isArray(payload.notificationIds)
    ? payload.notificationIds.map((value) => String(value)).filter(Boolean)
    : [];
  const result = await dispatchQueuedServiceNotifications({
    pageId: job.pageId ?? undefined,
    notificationIds,
  });
  return {
    ok: true,
    kind: "background_job",
    data: result,
    logs: [`service_notification_dispatch:${result.sent}:${result.failed}:${result.skipped}`],
  };
});
