import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { safeParseBody, withErrorHandler } from "@/lib/api-handler";
import {
  ackServiceRealtimeMessage,
  getServiceRealtimeSnapshot,
  listServiceRealtimeChannels,
  leaveServiceRealtimeChannel,
  replayServiceRealtimeMessages,
  upsertServiceRealtimePresence,
  publishServiceRealtimeMessage,
} from "@/lib/service-realtime";

type Params = { pageId: string };

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { userId: null as null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { userId: null as null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { userId: null as null, error: apiErrorJson("not_found", 404) };
  return { userId: user.id, error: null };
}

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const channelKey = searchParams.get("channel");
  if (!channelKey) {
    const channels = await listServiceRealtimeChannels(pageId);
    return NextResponse.json({ channels });
  }

  const afterId = searchParams.get("afterId");
  if (afterId) {
    const messages = await replayServiceRealtimeMessages({
      pageId,
      channelKey,
      afterId,
      limit: Number(searchParams.get("limit") ?? "50"),
    });
    return NextResponse.json({ channelKey, messages, mode: "delta" });
  }

  const snapshot = await getServiceRealtimeSnapshot({
    pageId,
    channelKey,
    messageLimit: Number(searchParams.get("limit") ?? "50"),
  });
  return NextResponse.json({ snapshot, mode: "full" });
});

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { userId, error } = await requireOwner(pageId, req);
  if (error) return error;

  const body = ((await safeParseBody(req)) ?? {}) as Record<string, unknown>;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "presence") {
    if (typeof body.channelKey !== "string" || typeof body.memberKey !== "string") {
      return apiErrorJson("channel_or_member_required", 400);
    }
    const result = await upsertServiceRealtimePresence({
      pageId,
      channelKey: body.channelKey,
      topic: typeof body.topic === "string" ? body.topic : undefined,
      kind: body.kind === "generic" || body.kind === "chat" || body.kind === "stream" || body.kind === "presence" ? body.kind : undefined,
      memberKey: body.memberKey,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      socketId: typeof body.socketId === "string" ? body.socketId : null,
      name: typeof body.name === "string" ? body.name : null,
      status:
        body.status === "online" || body.status === "away" || body.status === "busy" || body.status === "offline"
          ? body.status
          : "online",
      meta: toRecord(body.meta),
      actor: { userId },
    });
    return NextResponse.json(result);
  }

  if (action === "message") {
    if (typeof body.channelKey !== "string" || typeof body.senderKey !== "string") {
      return apiErrorJson("channel_or_sender_required", 400);
    }
    const result = await publishServiceRealtimeMessage({
      pageId,
      channelKey: body.channelKey,
      topic: typeof body.topic === "string" ? body.topic : undefined,
      kind: body.kind === "generic" || body.kind === "chat" || body.kind === "stream" || body.kind === "presence" ? body.kind : undefined,
      senderKey: body.senderKey,
      senderName: typeof body.senderName === "string" ? body.senderName : null,
      messageKey: typeof body.messageKey === "string" ? body.messageKey : null,
      type: typeof body.type === "string" ? body.type : "message",
      body: body.body,
      meta: toRecord(body.meta),
      actor: { userId },
    });
    return NextResponse.json(result);
  }

  if (action === "ack") {
    if (
      typeof body.channelKey !== "string" ||
      typeof body.messageId !== "string" ||
      typeof body.recipientKey !== "string"
    ) {
      return apiErrorJson("ack_invalid", 400);
    }
    const receipt = await ackServiceRealtimeMessage({
      pageId,
      channelKey: body.channelKey,
      messageId: body.messageId,
      recipientKey: body.recipientKey,
      state: body.state === "read" ? "read" : "delivered",
      actor: { userId },
    });
    return NextResponse.json({ receipt });
  }

  if (action === "leave") {
    if (typeof body.channelKey !== "string" || typeof body.memberKey !== "string") {
      return apiErrorJson("channel_or_member_required", 400);
    }
    const result = await leaveServiceRealtimeChannel({
      pageId,
      channelKey: body.channelKey,
      memberKey: body.memberKey,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      socketId: typeof body.socketId === "string" ? body.socketId : null,
      actor: { userId },
    });
    return NextResponse.json(result);
  }

  if (action === "sync") {
    if (typeof body.channelKey !== "string") {
      return apiErrorJson("channel_required", 400);
    }
    if (typeof body.afterId === "string" && body.afterId) {
      const messages = await replayServiceRealtimeMessages({
        pageId,
        channelKey: body.channelKey,
        afterId: body.afterId,
        limit: typeof body.limit === "number" ? body.limit : 50,
      });
      return NextResponse.json({ channelKey: body.channelKey, messages, mode: "delta" });
    }
    const snapshot = await getServiceRealtimeSnapshot({
      pageId,
      channelKey: body.channelKey,
      messageLimit: typeof body.limit === "number" ? body.limit : 50,
    });
    return NextResponse.json({ snapshot, mode: "full" });
  }

  return apiErrorJson("action_not_supported", 400);
});
