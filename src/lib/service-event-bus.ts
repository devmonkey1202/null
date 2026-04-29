import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { triggerWorkflowsForEvent } from "@/lib/app-workflow";
import { enqueueJob } from "@/lib/background-jobs";
import { registerBackgroundJobHandler } from "@/lib/service-runtime";
import { applyServiceEventToStateMachines, type ServiceEventLike } from "@/lib/service-state-machine";

const serviceEventEnvelopeSchema = z.object({
  stream: z.string().min(1),
  topic: z.string().min(1),
  type: z.string().min(1),
  eventKey: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  payload: z.unknown().optional(),
  meta: z.record(z.unknown()).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  availableAt: z.coerce.date().optional(),
});

export type ServiceEventEnvelope = z.infer<typeof serviceEventEnvelopeSchema>;

type ServiceEventDispatchResult =
  | {
      ok: true;
      status: "processed";
      eventId: string;
      transitions: Awaited<ReturnType<typeof applyServiceEventToStateMachines>>;
    }
  | {
      ok: true;
      status: "scheduled_retry" | "dead_letter";
      eventId: string;
      reason: string;
    };

function backoffMs(attempt: number) {
  const base = 2_000;
  const max = 60_000;
  return Math.min(max, base * 2 ** Math.min(5, Math.max(0, attempt)));
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === undefined || value === null) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  return value as Prisma.InputJsonValue;
}

export function parseServiceEventEnvelope(input: unknown) {
  return serviceEventEnvelopeSchema.safeParse(input);
}

function asEventLike(event: {
  id: string;
  page_id: string;
  stream: string;
  topic: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  source: string | null;
  payload: unknown;
  meta: unknown;
}): ServiceEventLike {
  return event;
}

export async function listServiceEvents(input: {
  pageId: string;
  stream?: string;
  topic?: string;
  entityType?: string;
  entityId?: string;
  status?: string;
  limit?: number;
}) {
  return prisma.serviceEvent.findMany({
    where: {
      page_id: input.pageId,
      ...(input.stream ? { stream: input.stream } : {}),
      ...(input.topic ? { topic: input.topic } : {}),
      ...(input.entityType ? { entity_type: input.entityType } : {}),
      ...(input.entityId ? { entity_id: input.entityId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: [{ published_at: "desc" }],
    take: Math.min(Math.max(input.limit ?? 100, 1), 500),
  });
}

export async function replayServiceEvents(input: {
  pageId: string;
  stream?: string;
  topic?: string;
  entityType?: string;
  entityId?: string;
  since?: Date;
  limit?: number;
}) {
  return prisma.serviceEvent.findMany({
    where: {
      page_id: input.pageId,
      ...(input.stream ? { stream: input.stream } : {}),
      ...(input.topic ? { topic: input.topic } : {}),
      ...(input.entityType ? { entity_type: input.entityType } : {}),
      ...(input.entityId ? { entity_id: input.entityId } : {}),
      ...(input.since ? { published_at: { gte: input.since } } : {}),
    },
    orderBy: [{ published_at: "asc" }],
    take: Math.min(Math.max(input.limit ?? 500, 1), 5000),
  });
}

export async function deadLetterServiceEvent(input: {
  pageId: string;
  eventId: string;
  reason: string;
  actor?: AppAuditActor;
}) {
  const current = await prisma.serviceEvent.findFirst({
    where: { id: input.eventId, page_id: input.pageId },
  });
  if (!current) throw new Error("service_event_not_found");
  const event = await prisma.serviceEvent.update({
    where: { id: input.eventId },
    data: {
      status: "dead_letter",
      dead_lettered_at: new Date(),
      meta: {
        ...(current.meta && typeof current.meta === "object" && !Array.isArray(current.meta) ? (current.meta as Record<string, unknown>) : {}),
        deadLetterReason: input.reason,
      } as Prisma.InputJsonValue,
    },
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_event_dead_letter",
    targetType: "service_event",
    targetId: input.eventId,
    actor: input.actor,
    meta: { reason: input.reason, type: event.type, topic: event.topic, stream: event.stream },
  });
  return event;
}

export async function scheduleServiceEventRetry(input: {
  pageId: string;
  eventId: string;
  reason: string;
  actor?: AppAuditActor;
}) {
  const event = await prisma.serviceEvent.findFirst({
    where: { id: input.eventId, page_id: input.pageId },
  });
  if (!event) throw new Error("service_event_not_found");
  if ((event.attempts ?? 0) >= (event.max_attempts ?? 3)) {
    await deadLetterServiceEvent(input);
    return { status: "dead_letter" as const, eventId: input.eventId };
  }
  const nextRun = new Date(Date.now() + backoffMs(event.attempts ?? 0));
  await prisma.serviceEvent.update({
    where: { id: input.eventId },
    data: {
      status: "published",
      available_at: nextRun,
      meta: {
        ...(event.meta && typeof event.meta === "object" && !Array.isArray(event.meta) ? (event.meta as Record<string, unknown>) : {}),
        lastRetryReason: input.reason,
      } as Prisma.InputJsonValue,
    },
  });
  await enqueueJob({
    pageId: input.pageId,
    queue: "events",
    type: "service-event-dispatch",
    runAt: nextRun,
    payload: { eventId: input.eventId },
    priority: 90,
    dedupeKey: `service-event-dispatch:${input.eventId}`,
    maxAttempts: 1,
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_event_retry_scheduled",
    targetType: "service_event",
    targetId: input.eventId,
    actor: input.actor,
    meta: { reason: input.reason, availableAt: nextRun.toISOString() },
  });
  return { status: "scheduled_retry" as const, eventId: input.eventId };
}

export async function dispatchServiceEvent(input: {
  pageId: string;
  eventId: string;
  actor?: AppAuditActor;
}): Promise<ServiceEventDispatchResult> {
  const current = await prisma.serviceEvent.findFirst({
    where: { id: input.eventId, page_id: input.pageId },
  });
  if (!current) throw new Error("service_event_not_found");

  const event = await prisma.serviceEvent.update({
    where: { id: current.id },
    data: {
      attempts: { increment: 1 },
    },
  });

  try {
    const transitions = await applyServiceEventToStateMachines({
      pageId: input.pageId,
      event: asEventLike(event),
      actor: input.actor,
    });
    await prisma.serviceEvent.update({
      where: { id: event.id },
      data: {
        status: "processed",
        processed_at: new Date(),
      },
    });
    return { ok: true, status: "processed", eventId: event.id, transitions };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const scheduled = await scheduleServiceEventRetry({
      pageId: input.pageId,
      eventId: event.id,
      reason,
      actor: input.actor,
    });
    if (scheduled.status === "dead_letter") {
      return { ok: true, status: "dead_letter", eventId: event.id, reason };
    }
    return { ok: true, status: "scheduled_retry", eventId: event.id, reason };
  }
}

export async function publishServiceEvent(input: {
  pageId: string;
  envelope: unknown;
  dispatch?: boolean;
  actor?: AppAuditActor;
}) {
  const envelope = serviceEventEnvelopeSchema.parse(input.envelope);
  const event = await prisma.serviceEvent.create({
    data: {
      page_id: input.pageId,
      stream: envelope.stream,
      topic: envelope.topic,
      event_key: envelope.eventKey ?? null,
      type: envelope.type,
      entity_type: envelope.entityType ?? null,
      entity_id: envelope.entityId ?? null,
      source: envelope.source ?? null,
      payload: toJsonValue(envelope.payload),
      meta: toJsonValue(envelope.meta),
      max_attempts: envelope.maxAttempts ?? 3,
      available_at: envelope.availableAt ?? new Date(),
    },
  });

  await logAppAudit({
    pageId: input.pageId,
    action: "service_event_publish",
    targetType: "service_event",
    targetId: event.id,
    actor: input.actor,
    meta: {
      stream: event.stream,
      topic: event.topic,
      type: event.type,
      entityType: event.entity_type,
      entityId: event.entity_id,
    },
  });

  await triggerWorkflowsForEvent(
    input.pageId,
    "service_event",
    {
      eventType: event.type,
      topic: event.topic,
      stream: event.stream,
      entityType: event.entity_type ?? "",
    },
    {
      eventId: event.id,
      stream: event.stream,
      topic: event.topic,
      type: event.type,
      entityType: event.entity_type,
      entityId: event.entity_id,
      payload: event.payload,
      meta: event.meta,
    },
  );

  const result = input.dispatch === false ? null : await dispatchServiceEvent({ pageId: input.pageId, eventId: event.id, actor: input.actor });
  return { event, result };
}

export async function compensateServiceEvent(input: {
  pageId: string;
  eventId: string;
  payload?: Record<string, unknown>;
  actor?: AppAuditActor;
}) {
  const original = await prisma.serviceEvent.findFirst({
    where: { id: input.eventId, page_id: input.pageId },
  });
  if (!original) throw new Error("service_event_not_found");
  await prisma.serviceEvent.update({
    where: { id: original.id },
    data: { status: "compensated" },
  });
  return publishServiceEvent({
    pageId: input.pageId,
    actor: input.actor,
    envelope: {
      stream: original.stream,
      topic: original.topic,
      type: `${original.type}.compensation`,
      entityType: original.entity_type ?? undefined,
      entityId: original.entity_id ?? undefined,
      source: "compensation",
      payload: {
        originalEventId: original.id,
        ...(input.payload ?? {}),
      },
      meta: {
        compensationOf: original.id,
      },
      eventKey: `${original.id}:compensation`,
    },
  });
}

registerBackgroundJobHandler("service-event-dispatch", async (job) => {
  const pageId = job.pageId ?? null;
  const payload = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
    ? (job.payload as Record<string, unknown>)
    : null;
  const eventId = typeof payload?.eventId === "string" ? payload.eventId : null;
  if (!pageId || !eventId) {
    return {
      ok: false,
      kind: "background_job",
      error: "service_event_dispatch_invalid_payload",
      errorCode: "service_event_dispatch_invalid_payload",
      logs: [],
    };
  }
  const result = await dispatchServiceEvent({ pageId, eventId });
  return {
    ok: true,
    kind: "background_job",
    data: result,
    logs: [`service_event_dispatch:${result.status}:${eventId}`],
  };
});
