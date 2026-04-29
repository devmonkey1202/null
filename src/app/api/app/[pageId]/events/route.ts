import { NextResponse } from "next/server";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { requireWorkflowAdmin } from "@/lib/workflow-access";
import {
  compensateServiceEvent,
  deadLetterServiceEvent,
  dispatchServiceEvent,
  listServiceEvents,
  publishServiceEvent,
  replayServiceEvents,
} from "@/lib/service-event-bus";

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await context.params;
  const access = await requireWorkflowAdmin(pageId, req);
  if (access.error) return access.error;
  const url = new URL(req.url);
  const stream = url.searchParams.get("stream") ?? undefined;
  const topic = url.searchParams.get("topic") ?? undefined;
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const events = await listServiceEvents({ pageId, stream, topic, entityType, entityId, status, limit });
  return NextResponse.json({ events });
});

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await context.params;
  const access = await requireWorkflowAdmin(pageId, req);
  if (access.error) return access.error;
  const body = (await safeParseBody(req)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "body_required" }, { status: 400 });

  const actor = {
    userId: access.actor?.userId ?? null,
    anonId: access.actor?.anonId ?? null,
    appUserId: access.actor?.appUserId ?? null,
  };

  if (body.action === "replay") {
    const events = await replayServiceEvents({
      pageId,
      stream: typeof body.stream === "string" ? body.stream : undefined,
      topic: typeof body.topic === "string" ? body.topic : undefined,
      entityType: typeof body.entityType === "string" ? body.entityType : undefined,
      entityId: typeof body.entityId === "string" ? body.entityId : undefined,
      since: typeof body.since === "string" ? new Date(body.since) : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });
    return NextResponse.json({ ok: true, events });
  }

  if (body.action === "dispatch") {
    if (typeof body.eventId !== "string") return NextResponse.json({ error: "event_id_required" }, { status: 400 });
    const result = await dispatchServiceEvent({ pageId, eventId: body.eventId, actor });
    return NextResponse.json({ ok: true, result });
  }

  if (body.action === "dead_letter") {
    if (typeof body.eventId !== "string") return NextResponse.json({ error: "event_id_required" }, { status: 400 });
    const event = await deadLetterServiceEvent({
      pageId,
      eventId: body.eventId,
      reason: typeof body.reason === "string" ? body.reason : "manual_dead_letter",
      actor,
    });
    return NextResponse.json({ ok: true, event });
  }

  if (body.action === "compensate") {
    if (typeof body.eventId !== "string") return NextResponse.json({ error: "event_id_required" }, { status: 400 });
    const result = await compensateServiceEvent({
      pageId,
      eventId: body.eventId,
      payload: body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? (body.payload as Record<string, unknown>) : undefined,
      actor,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const result = await publishServiceEvent({
    pageId,
    envelope: body.event ?? body,
    dispatch: body.dispatch !== false,
    actor,
  });
  return NextResponse.json({ ok: true, ...result });
});
