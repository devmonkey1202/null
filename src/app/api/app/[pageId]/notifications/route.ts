import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonObject } from "@/lib/validation";
import {
  appUserRecipientKey,
  dispatchQueuedServiceNotifications,
  listServiceNotificationPreferences,
  listServiceNotifications,
  queueServiceNotifications,
  scheduleServiceNotificationDispatch,
  upsertServiceNotificationPreference,
  type ServiceNotificationChannel,
} from "@/lib/service-notifications";

type Params = { pageId: string };

async function getPageAccess(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner: { select: { anon_id: true } } },
  });
  const appUser = page ? await resolveAppUserFromRequest(pageId, req) : null;
  const isOwner = Boolean(page && anonUserId && page.owner.anon_id === anonUserId);
  return { page, appUser, anonUserId, isOwner };
}

function parseRecipientKey(explicit: string | null, appUserId: string | undefined, isOwner: boolean, anonUserId: string | null) {
  const ownKey = appUserId ? appUserRecipientKey(appUserId) : isOwner && anonUserId ? `owner:${anonUserId}` : "";
  const next = explicit?.trim() || ownKey;
  return {
    ownKey,
    recipientKey: next,
  };
}

function parseChannels(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => String(entry))
    .filter(
      (channel): channel is ServiceNotificationChannel =>
        channel === "in_app" || channel === "email" || channel === "push" || channel === "sms",
    );
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { page, appUser, anonUserId, isOwner } = await getPageAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);
  if (!isOwner && !appUser) return apiErrorJson("permission_denied", 403);

  const url = new URL(req.url);
  const view = (url.searchParams.get("view") ?? "list").trim().toLowerCase();
  const { ownKey, recipientKey } = parseRecipientKey(url.searchParams.get("recipientKey"), appUser?.id, isOwner, anonUserId);
  if (!recipientKey) return apiErrorJson("recipient_required", 400);
  if (!isOwner && recipientKey !== ownKey) return apiErrorJson("permission_denied", 403);

  if (view === "preferences") {
    const items = await listServiceNotificationPreferences(pageId, recipientKey);
    return NextResponse.json({ items });
  }

  const result = await listServiceNotifications({
    pageId,
    recipientKey,
    unreadOnly: url.searchParams.get("unreadOnly") === "true",
    topic: url.searchParams.get("topic") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? "20"),
    offset: Number(url.searchParams.get("offset") ?? "0"),
  });
  return NextResponse.json(result);
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { page, appUser, anonUserId, isOwner } = await getPageAccess(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);
  if (!isOwner && !appUser) return apiErrorJson("permission_denied", 403);

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const action = String(body.action ?? "").trim().toLowerCase();

  if (action === "notify") {
    if (!isOwner) return apiErrorJson("permission_denied", 403);
    const recipients = Array.isArray(body.recipients)
      ? body.recipients
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const raw = entry as Record<string, unknown>;
            const recipientKey = typeof raw.recipientKey === "string" ? raw.recipientKey.trim() : "";
            if (!recipientKey) return null;
            return {
              recipientKey,
              recipientLabel: typeof raw.recipientLabel === "string" ? raw.recipientLabel : null,
              appUserId: typeof raw.appUserId === "string" ? raw.appUserId : null,
            };
          })
          .filter(
            (
              recipient,
            ): recipient is { recipientKey: string; recipientLabel: string | null; appUserId: string | null } =>
              Boolean(recipient),
          )
      : [];
    if (!recipients.length) return apiErrorJson("bad_request", 400, "recipients_required");

    const result = await queueServiceNotifications({
      pageId,
      recipients,
      type: typeof body.type === "string" ? body.type : undefined,
      topic: typeof body.topic === "string" ? body.topic : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      titleTemplate: typeof body.titleTemplate === "string" ? body.titleTemplate : undefined,
      bodyTemplate: typeof body.bodyTemplate === "string" ? body.bodyTemplate : undefined,
      variables: body.variables && typeof body.variables === "object" && !Array.isArray(body.variables)
        ? (body.variables as Record<string, unknown>)
        : undefined,
      channels: parseChannels(body.channels),
      payload: body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : undefined,
      sourceType: typeof body.sourceType === "string" ? body.sourceType : null,
      sourceId: typeof body.sourceId === "string" ? body.sourceId : null,
      scheduledFor: typeof body.scheduledFor === "string" ? new Date(body.scheduledFor) : null,
      autoDispatch: body.autoDispatch !== false,
      actor: { anonId: anonUserId },
    });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "dispatch") {
    if (!isOwner) return apiErrorJson("permission_denied", 403);
    const notificationIds = Array.isArray(body.notificationIds)
      ? body.notificationIds.map((value) => String(value)).filter(Boolean)
      : [];
    if (body.async !== false) {
      await scheduleServiceNotificationDispatch({ pageId, notificationIds: notificationIds.length ? notificationIds : undefined });
      return NextResponse.json({ ok: true, scheduled: true, notificationIds });
    }
    const result = await dispatchQueuedServiceNotifications({
      pageId,
      notificationIds: notificationIds.length ? notificationIds : undefined,
    });
    return NextResponse.json({ ok: true, scheduled: false, ...result });
  }

  if (action === "preference") {
    const { ownKey, recipientKey } = parseRecipientKey(
      typeof body.recipientKey === "string" ? body.recipientKey : null,
      appUser?.id,
      isOwner,
      anonUserId,
    );
    if (!recipientKey) return apiErrorJson("recipient_required", 400);
    if (!isOwner && recipientKey !== ownKey) return apiErrorJson("permission_denied", 403);
    const channel = String(body.channel ?? "").trim();
    if (channel !== "in_app" && channel !== "email" && channel !== "push" && channel !== "sms") {
      return apiErrorJson("bad_request", 400, "invalid_channel");
    }
    const preference = await upsertServiceNotificationPreference({
      pageId,
      recipientKey,
      channel,
      topic: typeof body.topic === "string" ? body.topic : undefined,
      enabled: body.enabled !== false,
      mutedUntil: typeof body.mutedUntil === "string" ? new Date(body.mutedUntil) : null,
      config: body.config && typeof body.config === "object" && !Array.isArray(body.config)
        ? (body.config as Record<string, unknown>)
        : undefined,
      actor: { anonId: anonUserId, appUserId: appUser?.id },
    });
    return NextResponse.json({ ok: true, preference });
  }

  return apiErrorJson("bad_action", 400);
}
