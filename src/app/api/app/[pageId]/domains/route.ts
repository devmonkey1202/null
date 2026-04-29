import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import type { AppRole } from "@/lib/app-permissions";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { parseJsonObject } from "@/lib/validation";
import {
  assignMembership,
  bootstrapAllServiceDomainEngines,
  bootstrapServiceDomainEngine,
  createApprovalDocument,
  createCrmLead,
  createCrmPipeline,
  createReservation,
  createReservationResource,
  createServiceComment,
  createServiceCommentThread,
  createServiceFeedPost,
  createTicket,
  createTicketQueue,
  decideApprovalDocument,
  listServiceComments,
  listServiceDomainEngines,
  moveCrmLead,
  queryServiceFeedEngine,
  startMembershipPlanSubscription,
  toggleServiceReaction,
  transitionReservation,
  transitionTicket,
  upsertMembershipTier,
  addTicketMessage,
  submitApprovalDocument,
  cancelMembershipPlanSubscription,
  type ServiceDomainEngineKey,
} from "@/lib/service-domain-engines";

type Params = { pageId: string };
const OPERATOR_ROLES: AppRole[] = ["admin", "editor"];
const PARTNER_OPERATOR_ROLES: AppRole[] = ["admin", "editor", "user"];

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

async function resolveAccess(req: Request, pageId: string) {
  return resolveServiceRouteAccess(req, pageId);
}

function permissionForAction(action: string) {
  if (action === "bootstrap.all" || action === "bootstrap") {
    return { ownerOnly: true } as const;
  }

  if (action === "feed.query" || action === "comments.list") {
    return { allowAnonymous: true } as const;
  }

  if (
    action === "feed.create" ||
    action === "comments.thread.create" ||
    action === "comments.create" ||
    action === "reactions.toggle" ||
    action === "reservations.create" ||
    action === "tickets.create" ||
    action === "documents.submit" ||
    action === "memberships.subscription.start" ||
    action === "memberships.subscription.cancel" ||
    action === "crm.lead.create"
  ) {
    return { appAction: "create" as const };
  }

  if (
    action === "reservations.transition" ||
    action === "tickets.transition" ||
    action === "tickets.message.add" ||
    action === "documents.decide"
  ) {
    return { appAction: "update" as const, allowedRoles: PARTNER_OPERATOR_ROLES };
  }

  if (action === "crm.lead.move") {
    return { appAction: "update" as const, allowedRoles: PARTNER_OPERATOR_ROLES };
  }

  if (
    action === "reservations.resource.create" ||
    action === "tickets.queue.create" ||
    action === "documents.create" ||
    action === "memberships.tier.upsert" ||
    action === "memberships.assign" ||
    action === "crm.pipeline.create"
  ) {
    return { allowedRoles: OPERATOR_ROLES };
  }

  return { appAction: "read" as const };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);

  const gate = await resolveAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { appAction: "read" });
  if (permissionError) return permissionError;

  const engines = await listServiceDomainEngines(pageId, gate.access.env);
  return NextResponse.json({ ok: true, engines, env: gate.access.env });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);

  const gate = await resolveAccess(req, pageId);
  if ("error" in gate) return gate.error;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const action = asString(body.action) ?? "";
  const permissionError = ensureServiceRoutePermission(gate.access, permissionForAction(action));
  if (permissionError) return permissionError;
  const actor = gate.access.actor;

  try {
    if (action === "bootstrap.all") {
      const engines = await bootstrapAllServiceDomainEngines({ pageId, actor, env: gate.access.env });
      return NextResponse.json({ ok: true, engines });
    }

    if (action === "bootstrap") {
      const engine = (asString(body.engine) ?? "") as ServiceDomainEngineKey;
      const engines = await bootstrapServiceDomainEngine({ pageId, engine, actor, env: gate.access.env });
      return NextResponse.json({ ok: true, engines });
    }

    if (action === "feed.create") {
      const post = await createServiceFeedPost({
        pageId,
        title: asString(body.title) ?? "",
        excerpt: asString(body.excerpt) ?? "",
        body: asString(body.body) ?? "",
        category: asString(body.category) ?? "",
        featured: body.featured === true,
        publishedAt: asString(body.publishedAt) ?? asString(body.published_at),
        score: Number(body.score ?? 0),
        views: Number(body.views ?? 0),
        upvotes: Number(body.upvotes ?? 0),
        tags: body.tags,
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, post });
    }

    if (action === "feed.query") {
      const feed = await queryServiceFeedEngine({
        pageId,
        limit: Number(body.limit ?? 20),
        offset: Number(body.offset ?? 0),
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, feed });
    }

    if (action === "comments.thread.create") {
      const thread = await createServiceCommentThread({
        pageId,
        key: asString(body.key) ?? "",
        title: asString(body.title) ?? "",
        entityType: asString(body.entityType) ?? asString(body.entity_type) ?? "",
        entityId: asString(body.entityId) ?? asString(body.entity_id) ?? "",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, thread });
    }

    if (action === "comments.create") {
      const comment = await createServiceComment({
        pageId,
        threadId: asString(body.threadId) ?? asString(body.thread_id) ?? "",
        body: asString(body.body) ?? "",
        authorKey: asString(body.authorKey) ?? asString(body.author_key) ?? "",
        parentCommentId: asString(body.parentCommentId) ?? asString(body.parent_comment_id) ?? null,
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, comment });
    }

    if (action === "comments.list") {
      const comments = await listServiceComments({
        pageId,
        threadId: asString(body.threadId) ?? asString(body.thread_id) ?? "",
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, comments });
    }

    if (action === "reactions.toggle") {
      const result = await toggleServiceReaction({
        pageId,
        threadId: asString(body.threadId) ?? asString(body.thread_id) ?? "",
        subjectType: ((asString(body.subjectType) ?? asString(body.subject_type) ?? "comment") as "thread" | "comment"),
        subjectId: asString(body.subjectId) ?? asString(body.subject_id) ?? "",
        emoji: asString(body.emoji) ?? "",
        actorKey: asString(body.actorKey) ?? asString(body.actor_key) ?? "",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "reservations.resource.create") {
      const resource = await createReservationResource({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        capacity: Number(body.capacity ?? 1),
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, resource });
    }

    if (action === "reservations.create") {
      const reservation = await createReservation({
        pageId,
        resourceId: asString(body.resourceId) ?? asString(body.resource_id) ?? "",
        title: asString(body.title) ?? "",
        customerKey: asString(body.customerKey) ?? asString(body.customer_key) ?? "",
        startsAt: asString(body.startsAt) ?? asString(body.starts_at) ?? "",
        endsAt: asString(body.endsAt) ?? asString(body.ends_at) ?? "",
        notes: asString(body.notes) ?? "",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, reservation });
    }

    if (action === "reservations.transition") {
      const reservation = await transitionReservation({
        pageId,
        reservationId: asString(body.reservationId) ?? asString(body.reservation_id) ?? "",
        eventType: (asString(body.eventType) ?? asString(body.event_type) ?? "reservation.confirm") as
          | "reservation.confirm"
          | "reservation.cancel"
          | "reservation.complete"
          | "reservation.no_show",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, reservation });
    }

    if (action === "tickets.queue.create") {
      const queue = await createTicketQueue({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        slaHours: Number(body.slaHours ?? body.sla_hours ?? 24),
        defaultAssignee: asString(body.defaultAssignee) ?? asString(body.default_assignee) ?? "",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, queue });
    }

    if (action === "tickets.create") {
      const ticket = await createTicket({
        pageId,
        queueId: asString(body.queueId) ?? asString(body.queue_id) ?? "",
        title: asString(body.title) ?? "",
        requesterKey: asString(body.requesterKey) ?? asString(body.requester_key) ?? "",
        body: asString(body.body) ?? "",
        assigneeKey: asString(body.assigneeKey) ?? asString(body.assignee_key) ?? "",
        priority: asString(body.priority) ?? "normal",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, ticket });
    }

    if (action === "tickets.transition") {
      const ticket = await transitionTicket({
        pageId,
        ticketId: asString(body.ticketId) ?? asString(body.ticket_id) ?? "",
        eventType: (asString(body.eventType) ?? asString(body.event_type) ?? "ticket.triage") as
          | "ticket.triage"
          | "ticket.start"
          | "ticket.wait_customer"
          | "ticket.resolve"
          | "ticket.close",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, ticket });
    }

    if (action === "tickets.message.add") {
      const message = await addTicketMessage({
        pageId,
        ticketId: asString(body.ticketId) ?? asString(body.ticket_id) ?? "",
        body: asString(body.body) ?? "",
        authorKey: asString(body.authorKey) ?? asString(body.author_key) ?? "",
        visibility: ((asString(body.visibility) ?? "public") as "public" | "internal"),
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, message });
    }

    if (action === "documents.create") {
      const document = await createApprovalDocument({
        pageId,
        key: asString(body.key) ?? "",
        title: asString(body.title) ?? "",
        body: asString(body.body) ?? "",
        approverKey: asString(body.approverKey) ?? asString(body.approver_key) ?? "",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, document });
    }

    if (action === "documents.submit") {
      const result = await submitApprovalDocument({
        pageId,
        documentId: asString(body.documentId) ?? asString(body.document_id) ?? "",
        subjectKey: asString(body.subjectKey) ?? asString(body.subject_key) ?? "",
        subjectLabel: asString(body.subjectLabel) ?? asString(body.subject_label) ?? "",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "documents.decide") {
      const result = await decideApprovalDocument({
        pageId,
        documentId: asString(body.documentId) ?? asString(body.document_id) ?? "",
        requestId: asString(body.requestId) ?? asString(body.request_id) ?? "",
        status: ((asString(body.status) ?? "approved") as "approved" | "rejected"),
        decidedByUserId: gate.access.userId,
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "memberships.tier.upsert") {
      const tier = await upsertMembershipTier({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        description: asString(body.description) ?? "",
        priceCents: Number(body.priceCents ?? body.price_cents ?? 0),
        currency: asString(body.currency) ?? "KRW",
        billingPlanKey: asString(body.billingPlanKey) ?? asString(body.billing_plan_key) ?? undefined,
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, tier });
    }

    if (action === "memberships.assign") {
      const membership = await assignMembership({
        pageId,
        tierId: asString(body.tierId) ?? asString(body.tier_id) ?? "",
        subjectKey: asString(body.subjectKey) ?? asString(body.subject_key) ?? "",
        status: asString(body.status) ?? "active",
        billingAccountId: asString(body.billingAccountId) ?? asString(body.billing_account_id) ?? "",
        subscriptionId: asString(body.subscriptionId) ?? asString(body.subscription_id) ?? "",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, membership });
    }

    if (action === "memberships.subscription.start") {
      const result = await startMembershipPlanSubscription({
        pageId,
        tierId: asString(body.tierId) ?? asString(body.tier_id) ?? "",
        subjectKey: asString(body.subjectKey) ?? asString(body.subject_key) ?? "",
        email: asString(body.email) ?? null,
        customerName: asString(body.customerName) ?? asString(body.customer_name) ?? null,
        quantity: Number(body.quantity ?? 1),
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "memberships.subscription.cancel") {
      const result = await cancelMembershipPlanSubscription({
        pageId,
        membershipId: asString(body.membershipId) ?? asString(body.membership_id) ?? "",
        cancelAtPeriodEnd: body.cancelAtPeriodEnd === true || body.cancel_at_period_end === true,
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "crm.pipeline.create") {
      const result = await createCrmPipeline({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        stages: Array.isArray(body.stages) ? (body.stages as Array<{ key: string; name: string; order: number; terminal?: boolean }>) : undefined,
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "crm.lead.create") {
      const lead = await createCrmLead({
        pageId,
        pipelineId: asString(body.pipelineId) ?? asString(body.pipeline_id) ?? "",
        stageId: asString(body.stageId) ?? asString(body.stage_id) ?? "",
        name: asString(body.name) ?? "",
        company: asString(body.company) ?? "",
        email: asString(body.email) ?? "",
        phone: asString(body.phone) ?? "",
        value: Number(body.value ?? 0),
        ownerKey: asString(body.ownerKey) ?? asString(body.owner_key) ?? "",
        notes: asString(body.notes) ?? "",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, lead });
    }

    if (action === "crm.lead.move") {
      const lead = await moveCrmLead({
        pageId,
        leadId: asString(body.leadId) ?? asString(body.lead_id) ?? "",
        stageId: asString(body.stageId) ?? asString(body.stage_id) ?? "",
        status: asString(body.status) ?? "qualified",
        actor,
        env: gate.access.env,
      });
      return NextResponse.json({ ok: true, lead });
    }

    return apiErrorJson("invalid_action", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "service_domain_engine_failed";
    return apiErrorJson(code, 400);
  }
}
