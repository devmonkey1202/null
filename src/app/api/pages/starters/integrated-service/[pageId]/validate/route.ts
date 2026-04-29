import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { apiErrorJson } from "@/lib/api-error";
import { listRecords } from "@/lib/app-data";
import { ensureIntegratedServiceScenarioState } from "@/lib/integrated-service-project";
import { resolveOwnedPageAccess } from "@/lib/owned-page-access";
import { parseJsonObject } from "@/lib/validation";
import { addTicketMessage, createReservation, createTicket, moveCrmLead, transitionReservation } from "@/lib/service-domain-engines";
import { buildServiceOperationsOverview, generateServiceRunbook } from "@/lib/service-operations";
import { listServiceBillingState } from "@/lib/service-billing";
import { evaluateServicePolicy, listServicePolicyState } from "@/lib/service-policy";

type Params = { pageId: string };

type RecordItem = {
  id: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function actorFromAccess(access: Awaited<ReturnType<typeof resolveOwnedPageAccess>>) {
  return {
    userId: access.user?.id ?? null,
    anonId: access.anonUserId ?? null,
  };
}

async function requireOwnedPage(req: Request, pageId: string) {
  const access = await resolveOwnedPageAccess(req, pageId);
  if (!access.user) return { error: apiErrorJson("user_not_found", 404) };
  if (!access.page) return { error: apiErrorJson("not_found", 404) };
  return { access };
}

function mapRecord(item: unknown): RecordItem {
  const source = asRecord(item);
  if (!source) return { id: "" };
  const data = asRecord(source.data) ?? {};
  return {
    id: asString(source.id),
    ...data,
    createdAt: toIso(source.created_at as Date | string | null | undefined),
    updatedAt: toIso(source.updated_at as Date | string | null | undefined),
    appUserId: asString(source.app_user_id),
  };
}

async function listCollection(pageId: string, slug: string, limit = 50): Promise<RecordItem[]> {
  const result = await listRecords(
    pageId,
    slug,
    {
      limit,
      orderBy: "created_at",
      orderDir: "asc",
    },
    "prod",
  );
  return result.items.map((item) => mapRecord(item));
}

async function buildValidationState(pageId: string) {
  const [
    chatRowsRaw,
    notificationRows,
    todoRows,
    noteRow,
    resources,
    reservations,
    tickets,
    ticketMessages,
    leads,
    stages,
    documents,
    overview,
    runbook,
    billing,
    policy,
  ] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { page_id: pageId },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
    prisma.pageNotification.findMany({
      where: { page_id: pageId },
      orderBy: { created_at: "desc" },
      take: 12,
    }),
    prisma.todo.findMany({
      where: { page_id: pageId },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    }),
    prisma.note.findUnique({
      where: { page_id: pageId },
    }),
    listCollection(pageId, "reservation_resources", 24),
    listCollection(pageId, "reservations", 24),
    listCollection(pageId, "tickets", 24),
    listCollection(pageId, "ticket_messages", 40),
    listCollection(pageId, "crm_leads", 32),
    listCollection(pageId, "crm_stages", 16),
    listCollection(pageId, "documents", 24),
    buildServiceOperationsOverview(pageId),
    generateServiceRunbook(pageId),
    listServiceBillingState(pageId),
    listServicePolicyState(pageId),
  ]);

  const chatMessages = chatRowsRaw
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      content: row.content,
      senderAnonId: row.sender_anon_id,
      senderUserId: row.sender_user_id,
      createdAt: row.created_at.toISOString(),
    }));

  const notifications = notificationRows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    refId: row.ref_id,
    readAt: toIso(row.read_at),
    createdAt: row.created_at.toISOString(),
  }));

  const todos = todoRows.map((row) => ({
    id: row.id,
    title: row.title,
    done: row.done,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));

  return {
    consumer: {
      chatMessages,
      notifications,
      todos,
      note: noteRow
        ? {
            id: noteRow.id,
            content: noteRow.content,
            updatedAt: noteRow.updated_at.toISOString(),
          }
        : null,
    },
    partner: {
      resources,
      reservations,
      tickets,
      ticketMessages,
      leads,
      stages: stages.sort((a, b) => asNumber(a.order, 0) - asNumber(b.order, 0)),
      documents,
    },
    ops: {
      overview,
      runbook,
      billing,
      policy,
    },
  };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await requireOwnedPage(req, pageId);
  if ("error" in gate) return gate.error;

  await ensureIntegratedServiceScenarioState(pageId, actorFromAccess(gate.access));
  const state = await buildValidationState(pageId);
  return NextResponse.json({ ok: true, state });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const gate = await requireOwnedPage(req, pageId);
  if ("error" in gate) return gate.error;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;

  const body = parsed.data as Record<string, unknown>;
  const action = asString(body.action);
  const actor = actorFromAccess(gate.access);

  try {
    await ensureIntegratedServiceScenarioState(pageId, actor);

    if (action === "consumer.chat.send") {
      const content = asString(body.content).trim();
      if (!content) return apiErrorJson("content_required", 400);
      const senderLabel = asString(body.senderLabel).trim() || "검증 사용자";
      await prisma.chatMessage.create({
        data: {
          page_id: pageId,
          sender_user_id: null,
          sender_anon_id: senderLabel,
          content,
        },
      });
      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "consumer.todo.create") {
      const title = asString(body.title).trim();
      if (!title) return apiErrorJson("title_required", 400);
      const maxSort = await prisma.todo.aggregate({
        where: { page_id: pageId },
        _max: { sort_order: true },
      });
      await prisma.todo.create({
        data: {
          page_id: pageId,
          title,
          done: false,
          sort_order: (maxSort._max.sort_order ?? 0) + 1,
        },
      });
      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "consumer.todo.toggle") {
      const todoId = asString(body.todoId);
      const done = body.done === true;
      if (!todoId) return apiErrorJson("todo_id_required", 400);
      await prisma.todo.update({
        where: { id: todoId },
        data: { done },
      });
      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "consumer.note.save") {
      const content = asString(body.content);
      await prisma.note.upsert({
        where: { page_id: pageId },
        update: { content },
        create: {
          page_id: pageId,
          author_user_id: gate.access.user?.id ?? null,
          author_anon_id: gate.access.anonUserId ?? null,
          content,
        },
      });
      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "consumer.reservation.request") {
      const title = asString(body.title).trim();
      const notes = asString(body.notes).trim();
      const customerKey = asString(body.customerKey).trim() || "member:guest";
      const resourceId = asString(body.resourceId).trim();
      if (!title || !resourceId) return apiErrorJson("invalid_action_payload", 400);

      const startsAt = new Date();
      startsAt.setHours(startsAt.getHours() + 24);
      startsAt.setMinutes(0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

      await createReservation({
        pageId,
        resourceId,
        title,
        customerKey,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes,
        actor,
      });

      await prisma.pageNotification.create({
        data: {
          page_id: pageId,
          type: "reservation_requested",
          title: "새 예약 요청이 도착했습니다",
          body: `${title} 예약 요청이 파트너 포털에 추가되었습니다.`,
          ref_id: resourceId,
        },
      });

      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "consumer.ticket.create") {
      const title = asString(body.title).trim();
      const message = asString(body.message).trim();
      const requesterKey = asString(body.requesterKey).trim() || "member:guest";
      if (!title || !message) return apiErrorJson("invalid_action_payload", 400);

      const queues = await listCollection(pageId, "ticket_queues", 8);
      const queue = queues[0];
      if (!queue?.id) return apiErrorJson("ticket_queue_not_found", 404);

      const ticket = await createTicket({
        pageId,
        queueId: queue.id,
        title,
        requesterKey,
        body: message,
        priority: "normal",
        actor,
      });

      await addTicketMessage({
        pageId,
        ticketId: ticket.id,
        body: message,
        authorKey: requesterKey,
        visibility: "public",
        actor,
      });

      await prisma.pageNotification.create({
        data: {
          page_id: pageId,
          type: "ticket_created",
          title: "새 고객 지원 요청이 생성되었습니다",
          body: `${title} 티켓이 파트너 포털에 추가되었습니다.`,
          ref_id: ticket.id,
        },
      });

      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "partner.reservation.advance") {
      const reservationId = asString(body.reservationId);
      const eventType = asString(body.eventType) as
        | "reservation.confirm"
        | "reservation.cancel"
        | "reservation.complete"
        | "reservation.no_show";
      if (!reservationId || !eventType) return apiErrorJson("invalid_action_payload", 400);
      await transitionReservation({
        pageId,
        reservationId,
        eventType,
        actor,
      });
      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "partner.ticket.reply") {
      const ticketId = asString(body.ticketId);
      const message = asString(body.message).trim();
      const authorKey = asString(body.authorKey).trim() || "partner-ops";
      if (!ticketId || !message) return apiErrorJson("invalid_action_payload", 400);
      await addTicketMessage({
        pageId,
        ticketId,
        body: message,
        authorKey,
        visibility: "public",
        actor,
      });
      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "partner.crm.advance") {
      const leadId = asString(body.leadId);
      if (!leadId) return apiErrorJson("lead_id_required", 400);

      const [leads, stages] = await Promise.all([
        listCollection(pageId, "crm_leads", 100),
        listCollection(pageId, "crm_stages", 100),
      ]);
      const lead = leads.find((item) => item.id === leadId);
      if (!lead) return apiErrorJson("lead_not_found", 404);

      const orderedStages = stages.sort((a, b) => asNumber(a.order, 0) - asNumber(b.order, 0));
      const currentIndex = orderedStages.findIndex((stage) => stage.id === asString(lead.stage_id));
      const nextStage = orderedStages[currentIndex + 1] ?? orderedStages[currentIndex];
      if (!nextStage?.id) return apiErrorJson("next_stage_not_found", 400);

      await moveCrmLead({
        pageId,
        leadId,
        stageId: asString(nextStage.id),
        status: currentIndex + 1 >= orderedStages.length - 1 ? "won" : "qualified",
        actor,
      });
      return NextResponse.json({ ok: true, state: await buildValidationState(pageId) });
    }

    if (action === "ops.policy.evaluate") {
      const evaluation = await evaluateServicePolicy({
        pageId,
        subjectKey: asString(body.subjectKey).trim() || "policy:ops",
        actionKey: asString(body.actionKey).trim() || "document.publish",
        resourceType: asString(body.resourceType).trim() || "document",
        context: asRecord(body.context) ?? {},
      });
      return NextResponse.json({ ok: true, state: await buildValidationState(pageId), evaluation });
    }

    return apiErrorJson("invalid_action", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "integrated_validation_action_failed";
    return apiErrorJson(code, 400);
  }
}
