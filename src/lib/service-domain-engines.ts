import { prisma } from "@/lib/db";
import {
  createRecord,
  getCollectionBySlug,
  getCollections,
  getRecord,
  listRecords,
  setSchema,
  updateRecord,
  validateRecordData,
  validateRelationTargets,
  type AppCollectionDef,
  type AppFieldDef,
} from "@/lib/app-data";
import { type AppAuditActor } from "@/lib/app-audit";
import { type AppEnv } from "@/lib/app-env";
import {
  createServiceApprovalRequest,
  decideServiceApprovalRequest,
  listServicePolicyState,
  upsertServicePolicyRule,
} from "@/lib/service-policy";
import {
  assembleServiceFeed,
  ensureDefaultServiceRankingRules,
  syncServiceRankingRecord,
} from "@/lib/service-ranking";
import {
  createServiceStateMachine,
  listServiceStateMachines,
  updateServiceStateMachine,
  type ServiceStateMachineDefinition,
} from "@/lib/service-state-machine";
import {
  cancelServiceBillingSubscription,
  listServiceBillingState,
  startServiceBillingSubscription,
  upsertServiceBillingAccount,
  upsertServiceBillingPlan,
} from "@/lib/service-billing";
import {
  ensureDefaultServiceSearchIndices,
  syncServiceSearchRecord,
} from "@/lib/service-search";
import { publishServiceEvent } from "@/lib/service-event-bus";

export type ServiceDomainEngineKey =
  | "feed"
  | "comments"
  | "reservations"
  | "tickets"
  | "approvals"
  | "memberships"
  | "crm";

type DomainEngineDefinition = {
  key: ServiceDomainEngineKey;
  name: string;
  collections: AppCollectionDef[];
  machineKeys?: string[];
  policyRuleKeys?: string[];
  billingPlanKeys?: string[];
};

type DomainRecord = {
  id: string;
  data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  app_user_id?: string | null;
};

const FEED_COLLECTION: AppCollectionDef = {
  slug: "feed_posts",
  name: "Feed Posts",
  strict: true,
  fields: [
    { name: "title", type: "string", required: true, minLength: 1, maxLength: 200 },
    { name: "excerpt", type: "string", maxLength: 500 },
    { name: "body", type: "string" },
    { name: "category", type: "string", maxLength: 80 },
    { name: "featured", type: "boolean", default: false },
    { name: "published_at", type: "date", required: true },
    { name: "score", type: "number", default: 0, min: 0 },
    { name: "views", type: "number", default: 0, min: 0 },
    { name: "upvotes", type: "number", default: 0, min: 0 },
    { name: "visibility", type: "string", enum: ["public", "private"], default: "public" },
    { name: "tags", type: "json", default: [] },
  ],
};

const COMMENTS_COLLECTIONS: AppCollectionDef[] = [
  {
    slug: "comment_threads",
    name: "Comment Threads",
    strict: true,
    fields: [
      { name: "key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "title", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "entity_type", type: "string", required: true, minLength: 1, maxLength: 80 },
      { name: "entity_id", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "status", type: "string", enum: ["open", "closed"], default: "open" },
    ],
  },
  {
    slug: "comment_entries",
    name: "Comment Entries",
    strict: true,
    fields: [
      { name: "thread_id", type: "relation", required: true },
      { name: "body", type: "string", required: true, minLength: 1, maxLength: 5000 },
      { name: "author_key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "parent_comment_id", type: "relation" },
      { name: "status", type: "string", enum: ["visible", "hidden"], default: "visible" },
    ],
  },
  {
    slug: "comment_reactions",
    name: "Comment Reactions",
    strict: true,
    fields: [
      { name: "thread_id", type: "relation", required: true },
      { name: "subject_type", type: "string", required: true, enum: ["thread", "comment"] },
      { name: "subject_id", type: "relation", required: true },
      { name: "emoji", type: "string", required: true, minLength: 1, maxLength: 24 },
      { name: "actor_key", type: "string", required: true, minLength: 1, maxLength: 120 },
    ],
  },
];

const RESERVATION_COLLECTIONS: AppCollectionDef[] = [
  {
    slug: "reservation_resources",
    name: "Reservation Resources",
    strict: true,
    fields: [
      { name: "key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "name", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "capacity", type: "number", default: 1, min: 1 },
      { name: "status", type: "string", enum: ["active", "inactive"], default: "active" },
    ],
  },
  {
    slug: "reservations",
    name: "Reservations",
    strict: true,
    fields: [
      { name: "resource_id", type: "relation", required: true },
      { name: "title", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "customer_key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "starts_at", type: "date", required: true },
      { name: "ends_at", type: "date", required: true },
      { name: "state", type: "string", enum: ["requested", "confirmed", "canceled", "completed", "no_show"], default: "requested" },
      { name: "notes", type: "string", maxLength: 4000 },
    ],
  },
];

const TICKET_COLLECTIONS: AppCollectionDef[] = [
  {
    slug: "ticket_queues",
    name: "Ticket Queues",
    strict: true,
    fields: [
      { name: "key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "name", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "sla_hours", type: "number", default: 24, min: 0 },
      { name: "default_assignee", type: "string", maxLength: 120 },
    ],
  },
  {
    slug: "tickets",
    name: "Tickets",
    strict: true,
    fields: [
      { name: "queue_id", type: "relation", required: true },
      { name: "title", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "body", type: "string", maxLength: 10000 },
      { name: "requester_key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "assignee_key", type: "string", maxLength: 120 },
      { name: "priority", type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal" },
      { name: "state", type: "string", enum: ["open", "triaged", "in_progress", "waiting_customer", "resolved", "closed"], default: "open" },
      { name: "tags", type: "json", default: [] },
    ],
  },
  {
    slug: "ticket_messages",
    name: "Ticket Messages",
    strict: true,
    fields: [
      { name: "ticket_id", type: "relation", required: true },
      { name: "body", type: "string", required: true, minLength: 1, maxLength: 10000 },
      { name: "author_key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "visibility", type: "string", enum: ["public", "internal"], default: "public" },
    ],
  },
];

const APPROVAL_COLLECTIONS: AppCollectionDef[] = [
  {
    slug: "documents",
    name: "Documents",
    strict: true,
    fields: [
      { name: "key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "title", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "body", type: "string", maxLength: 20000 },
      { name: "status", type: "string", enum: ["draft", "submitted", "approved", "rejected", "published"], default: "draft" },
      { name: "approval_request_id", type: "string", maxLength: 120 },
      { name: "approver_key", type: "string", maxLength: 120 },
      { name: "version", type: "number", default: 1, min: 1 },
    ],
  },
];

const MEMBERSHIP_COLLECTIONS: AppCollectionDef[] = [
  {
    slug: "membership_tiers",
    name: "Membership Tiers",
    strict: true,
    fields: [
      { name: "key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "name", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "description", type: "string", maxLength: 2000 },
      { name: "billing_plan_key", type: "string", maxLength: 120 },
      { name: "price_cents", type: "number", min: 0, default: 0 },
      { name: "currency", type: "string", maxLength: 16, default: "KRW" },
      { name: "active", type: "boolean", default: true },
    ],
  },
  {
    slug: "memberships",
    name: "Memberships",
    strict: true,
    fields: [
      { name: "tier_id", type: "relation", required: true },
      { name: "subject_key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "status", type: "string", enum: ["invited", "active", "paused", "canceled", "expired"], default: "active" },
      { name: "billing_account_id", type: "string", maxLength: 120 },
      { name: "subscription_id", type: "string", maxLength: 120 },
    ],
  },
];

const CRM_COLLECTIONS: AppCollectionDef[] = [
  {
    slug: "crm_pipelines",
    name: "CRM Pipelines",
    strict: true,
    fields: [
      { name: "key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "name", type: "string", required: true, minLength: 1, maxLength: 200 },
    ],
  },
  {
    slug: "crm_stages",
    name: "CRM Stages",
    strict: true,
    fields: [
      { name: "pipeline_id", type: "relation", required: true },
      { name: "key", type: "string", required: true, minLength: 1, maxLength: 120 },
      { name: "name", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "order", type: "number", required: true, min: 0 },
      { name: "terminal", type: "boolean", default: false },
    ],
  },
  {
    slug: "crm_leads",
    name: "CRM Leads",
    strict: true,
    fields: [
      { name: "pipeline_id", type: "relation", required: true },
      { name: "stage_id", type: "relation", required: true },
      { name: "name", type: "string", required: true, minLength: 1, maxLength: 200 },
      { name: "company", type: "string", maxLength: 200 },
      { name: "email", type: "string", maxLength: 200 },
      { name: "phone", type: "string", maxLength: 80 },
      { name: "value", type: "number", min: 0, default: 0 },
      { name: "status", type: "string", enum: ["new", "qualified", "proposal", "negotiation", "won", "lost"], default: "new" },
      { name: "owner_key", type: "string", maxLength: 120 },
      { name: "notes", type: "string", maxLength: 5000 },
    ],
  },
];

const RESERVATION_MACHINE: ServiceStateMachineDefinition = {
  initialState: "requested",
  deadLetterState: "canceled",
  states: [
    { key: "requested" },
    { key: "confirmed" },
    { key: "canceled", terminal: true },
    { key: "completed", terminal: true },
    { key: "no_show", terminal: true },
  ],
  transitions: [
    { key: "confirm", from: "requested", to: "confirmed", on: { type: "reservation.confirm" } },
    { key: "cancel", from: ["requested", "confirmed"], to: "canceled", on: { type: "reservation.cancel" } },
    { key: "complete", from: "confirmed", to: "completed", on: { type: "reservation.complete" } },
    { key: "no_show", from: "confirmed", to: "no_show", on: { type: "reservation.no_show" } },
  ],
};

const TICKET_MACHINE: ServiceStateMachineDefinition = {
  initialState: "open",
  deadLetterState: "closed",
  states: [
    { key: "open" },
    { key: "triaged" },
    { key: "in_progress" },
    { key: "waiting_customer" },
    { key: "resolved" },
    { key: "closed", terminal: true },
  ],
  transitions: [
    { key: "triage", from: "open", to: "triaged", on: { type: "ticket.triage" } },
    { key: "start", from: ["open", "triaged", "waiting_customer"], to: "in_progress", on: { type: "ticket.start" } },
    { key: "wait_customer", from: "in_progress", to: "waiting_customer", on: { type: "ticket.wait_customer" } },
    { key: "resolve", from: ["triaged", "in_progress", "waiting_customer"], to: "resolved", on: { type: "ticket.resolve" } },
    { key: "close", from: ["resolved", "waiting_customer"], to: "closed", on: { type: "ticket.close" } },
  ],
};

const APPROVAL_MACHINE: ServiceStateMachineDefinition = {
  initialState: "draft",
  deadLetterState: "rejected",
  states: [
    { key: "draft" },
    { key: "submitted" },
    { key: "approved" },
    { key: "rejected", terminal: true },
    { key: "published", terminal: true },
  ],
  transitions: [
    { key: "submit", from: "draft", to: "submitted", on: { type: "document.submit" } },
    { key: "approve", from: "submitted", to: "approved", on: { type: "document.approve" } },
    { key: "reject", from: "submitted", to: "rejected", on: { type: "document.reject" } },
    { key: "publish", from: "approved", to: "published", on: { type: "document.publish" } },
  ],
};

const DOMAIN_ENGINES: DomainEngineDefinition[] = [
  { key: "feed", name: "Feed Engine", collections: [FEED_COLLECTION] },
  { key: "comments", name: "Comments / Reactions Engine", collections: COMMENTS_COLLECTIONS },
  { key: "reservations", name: "Reservation Engine", collections: RESERVATION_COLLECTIONS, machineKeys: ["reservation_default"] },
  { key: "tickets", name: "Ticket Engine", collections: TICKET_COLLECTIONS, machineKeys: ["ticket_default"] },
  { key: "approvals", name: "Approval / Document Engine", collections: APPROVAL_COLLECTIONS, machineKeys: ["document_approval_default"], policyRuleKeys: ["document_publish_review"] },
  { key: "memberships", name: "Membership Engine", collections: MEMBERSHIP_COLLECTIONS, billingPlanKeys: ["membership_default"] },
  { key: "crm", name: "CRM / Lead Pipeline Engine", collections: CRM_COLLECTIONS },
];

function toObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function normalizeStatus(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || fallback;
}

function toRecordActor(actor?: AppAuditActor) {
  if (!actor) return undefined;
  return {
    userId: actor.userId ?? undefined,
    appUserId: actor.appUserId ?? undefined,
    anonId: actor.anonId ?? undefined,
  };
}

function buildEngineCollectionSet(engine: DomainEngineDefinition) {
  return new Set(engine.collections.map((collection) => collection.slug));
}

async function upsertStateMachineByKey(input: {
  pageId: string;
  key: string;
  name: string;
  definition: ServiceStateMachineDefinition;
  actor?: AppAuditActor;
}) {
  const existing = await prisma.serviceStateMachine.findFirst({
    where: { page_id: input.pageId, key: input.key },
    select: { id: true },
  });
  if (existing) {
    return updateServiceStateMachine({
      pageId: input.pageId,
      machineId: existing.id,
      key: input.key,
      name: input.name,
      definition: input.definition,
      enabled: true,
      actor: input.actor,
    });
  }
  return createServiceStateMachine({
    pageId: input.pageId,
    key: input.key,
    name: input.name,
    definition: input.definition,
    enabled: true,
    actor: input.actor,
  });
}

async function ensureDomainState(pageId: string, actor?: AppAuditActor) {
  await Promise.all([
    upsertStateMachineByKey({
      pageId,
      key: "reservation_default",
      name: "Reservation Default",
      definition: RESERVATION_MACHINE,
      actor,
    }),
    upsertStateMachineByKey({
      pageId,
      key: "ticket_default",
      name: "Ticket Default",
      definition: TICKET_MACHINE,
      actor,
    }),
    upsertStateMachineByKey({
      pageId,
      key: "document_approval_default",
      name: "Document Approval Default",
      definition: APPROVAL_MACHINE,
      actor,
    }),
    upsertServicePolicyRule({
      pageId,
      key: "document_publish_review",
      name: "Document publish review",
      effect: "review",
      actionKey: "document.publish",
      resourceType: "document",
      priority: 700,
      enabled: true,
      conditions: { requiresApproval: true },
      actor,
    }),
    upsertServiceBillingPlan({
      pageId,
      key: "membership_default",
      name: "Membership Default",
      chargeModel: "subscription",
      billingInterval: "month",
      unitAmountCents: 0,
      currency: "KRW",
      active: true,
      metadata: { engine: "memberships" },
    }),
  ]);
}

async function ensureEngineCollections(pageId: string, engine: DomainEngineDefinition, env: AppEnv) {
  await setSchema(pageId, engine.collections, { mode: "preserve" }, env);
}

async function ensureIndexes(pageId: string) {
  await ensureDefaultServiceSearchIndices(pageId);
  await ensureDefaultServiceRankingRules(pageId);
}

async function validateAndCreateRecord(
  pageId: string,
  collectionSlug: string,
  data: Record<string, unknown>,
  actor?: AppAuditActor,
  env: AppEnv = "prod",
) {
  const collection = await getCollectionBySlug(pageId, collectionSlug, env);
  if (!collection) throw new Error("collection_not_found");
  const fields = (collection.fields ?? []) as AppFieldDef[];
  const validated = validateRecordData(fields, data, { mode: "create", strict: Boolean(collection.strict) });
  if (validated.errors.length) throw new Error("validation_failed");
  const relationCheck = await validateRelationTargets(pageId, fields, validated.data, {});
  if (!relationCheck.ok) throw new Error("relation_invalid");
  const record = await createRecord(pageId, collectionSlug, validated.data, toRecordActor(actor), undefined, env);
  await Promise.all([
    syncServiceSearchRecord({ pageId, collectionSlug, recordId: record.id }),
    syncServiceRankingRecord({ pageId, collectionSlug, recordId: record.id }),
  ]);
  return record;
}

async function validateAndUpdateRecord(
  pageId: string,
  collectionSlug: string,
  id: string,
  patch: Record<string, unknown>,
  actor?: AppAuditActor,
  env: AppEnv = "prod",
) {
  const collection = await getCollectionBySlug(pageId, collectionSlug, env);
  if (!collection) throw new Error("collection_not_found");
  const existing = await getRecord(pageId, collectionSlug, id, undefined, env);
  if (!existing) throw new Error("record_not_found");
  const fields = (collection.fields ?? []) as AppFieldDef[];
  const merged = { ...toObject(existing.data), ...patch };
  const validated = validateRecordData(fields, merged, { mode: "create", strict: Boolean(collection.strict) });
  if (validated.errors.length) throw new Error("validation_failed");
  const relationCheck = await validateRelationTargets(pageId, fields, validated.data, {});
  if (!relationCheck.ok) throw new Error("relation_invalid");
  const record = await updateRecord(pageId, collectionSlug, id, validated.data, { replace: true }, toRecordActor(actor), env);
  if (!record) throw new Error("record_not_found");
  await Promise.all([
    syncServiceSearchRecord({ pageId, collectionSlug, recordId: record.id }),
    syncServiceRankingRecord({ pageId, collectionSlug, recordId: record.id }),
  ]);
  return record;
}

async function listCollectionRecords(pageId: string, collectionSlug: string, env: AppEnv = "prod") {
  const result = await listRecords(pageId, collectionSlug, { limit: 500, offset: 0, orderBy: "updated_at", orderDir: "desc" }, env);
  return result.items as DomainRecord[];
}

function findDomainEngine(key: ServiceDomainEngineKey) {
  const engine = DOMAIN_ENGINES.find((item) => item.key === key);
  if (!engine) throw new Error("engine_not_found");
  return engine;
}

export async function listServiceDomainEngines(pageId: string, env: AppEnv = "prod") {
  const [collections, machines, policyState, billingState] = await Promise.all([
    getCollections(pageId, env),
    listServiceStateMachines(pageId),
    listServicePolicyState(pageId),
    listServiceBillingState(pageId),
  ]);
  const collectionSet = new Set(collections.map((collection) => collection.slug));
  const machineSet = new Set(machines.map((machine) => machine.key));
  const policySet = new Set(policyState.rules.map((rule) => rule.key));
  const billingPlanSet = new Set(billingState.plans.map((plan) => plan.key));

  return DOMAIN_ENGINES.map((engine) => {
    const requiredCollections = buildEngineCollectionSet(engine);
    const collectionsReady = Array.from(requiredCollections).every((slug) => collectionSet.has(slug));
    const machinesReady = (engine.machineKeys ?? []).every((key) => machineSet.has(key));
    const policyReady = (engine.policyRuleKeys ?? []).every((key) => policySet.has(key));
    const billingReady = (engine.billingPlanKeys ?? []).every((key) => billingPlanSet.has(key));
    return {
      key: engine.key,
      name: engine.name,
      ready: collectionsReady && machinesReady && policyReady && billingReady,
      collectionsReady,
      machinesReady,
      policyReady,
      billingReady,
      collections: engine.collections.map((collection) => collection.slug),
      machineKeys: engine.machineKeys ?? [],
      policyRuleKeys: engine.policyRuleKeys ?? [],
      billingPlanKeys: engine.billingPlanKeys ?? [],
    };
  });
}

export async function bootstrapServiceDomainEngine(input: {
  pageId: string;
  engine: ServiceDomainEngineKey;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  const env = input.env ?? "prod";
  const engine = findDomainEngine(input.engine);
  await ensureEngineCollections(input.pageId, engine, env);
  await ensureIndexes(input.pageId);
  if (engine.machineKeys?.length || engine.policyRuleKeys?.length || engine.billingPlanKeys?.length) {
    await ensureDomainState(input.pageId, input.actor);
  }
  return listServiceDomainEngines(input.pageId, env);
}

export async function bootstrapAllServiceDomainEngines(input: {
  pageId: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  const env = input.env ?? "prod";
  for (const engine of DOMAIN_ENGINES) {
    await ensureEngineCollections(input.pageId, engine, env);
  }
  await ensureIndexes(input.pageId);
  await ensureDomainState(input.pageId, input.actor);
  return listServiceDomainEngines(input.pageId, env);
}

export async function createServiceFeedPost(input: {
  pageId: string;
  title: string;
  excerpt?: string;
  body?: string;
  category?: string;
  featured?: boolean;
  publishedAt?: string;
  score?: number;
  views?: number;
  upvotes?: number;
  tags?: unknown;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "feed", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "feed_posts",
    {
      title: input.title,
      excerpt: input.excerpt ?? "",
      body: input.body ?? "",
      category: input.category ?? "",
      featured: input.featured ?? false,
      published_at: input.publishedAt ?? new Date().toISOString(),
      score: input.score ?? 0,
      views: input.views ?? 0,
      upvotes: input.upvotes ?? 0,
      visibility: "public",
      tags: Array.isArray(input.tags) ? input.tags : [],
    },
    input.actor,
    input.env,
  );
}

export async function queryServiceFeedEngine(input: {
  pageId: string;
  limit?: number;
  offset?: number;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "feed", env: input.env });
  return assembleServiceFeed(
    input.pageId,
    {
      ruleWeights: [{ ruleKey: "collection:feed_posts:default", weight: 1 }],
      limit: input.limit,
      offset: input.offset,
    },
    { isOwner: true, env: input.env ?? "prod" },
  );
}

export async function createServiceCommentThread(input: {
  pageId: string;
  key: string;
  title: string;
  entityType: string;
  entityId: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "comments", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "comment_threads",
    {
      key: input.key,
      title: input.title,
      entity_type: input.entityType,
      entity_id: input.entityId,
      status: "open",
    },
    input.actor,
    input.env,
  );
}

export async function createServiceComment(input: {
  pageId: string;
  threadId: string;
  body: string;
  authorKey: string;
  parentCommentId?: string | null;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "comments", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "comment_entries",
    {
      thread_id: input.threadId,
      body: input.body,
      author_key: input.authorKey,
      parent_comment_id: input.parentCommentId ?? null,
      status: "visible",
    },
    input.actor,
    input.env,
  );
}

export async function listServiceComments(input: {
  pageId: string;
  threadId: string;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "comments", env: input.env });
  const comments = await listCollectionRecords(input.pageId, "comment_entries", input.env);
  return comments.filter((item) => asString(item.data.thread_id) === input.threadId);
}

export async function toggleServiceReaction(input: {
  pageId: string;
  threadId: string;
  subjectType: "thread" | "comment";
  subjectId: string;
  emoji: string;
  actorKey: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "comments", actor: input.actor, env: input.env });
  const reactions = await listCollectionRecords(input.pageId, "comment_reactions", input.env);
  const existing = reactions.find(
    (item) =>
      asString(item.data.thread_id) === input.threadId &&
      asString(item.data.subject_type) === input.subjectType &&
      asString(item.data.subject_id) === input.subjectId &&
      asString(item.data.emoji) === input.emoji &&
      asString(item.data.actor_key) === input.actorKey,
  );
  if (existing) {
    await prisma.appRecord.delete({ where: { id: existing.id } });
    return { toggled: "removed", reactionId: existing.id };
  }
  const reaction = await validateAndCreateRecord(
    input.pageId,
    "comment_reactions",
    {
      thread_id: input.threadId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      emoji: input.emoji,
      actor_key: input.actorKey,
    },
    input.actor,
    input.env,
  );
  return { toggled: "added", reactionId: reaction.id };
}

export async function createReservationResource(input: {
  pageId: string;
  key: string;
  name: string;
  capacity?: number;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "reservations", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "reservation_resources",
    {
      key: input.key,
      name: input.name,
      capacity: input.capacity ?? 1,
      status: "active",
    },
    input.actor,
    input.env,
  );
}

export async function createReservation(input: {
  pageId: string;
  resourceId: string;
  title: string;
  customerKey: string;
  startsAt: string;
  endsAt: string;
  notes?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "reservations", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "reservations",
    {
      resource_id: input.resourceId,
      title: input.title,
      customer_key: input.customerKey,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      state: "requested",
      notes: input.notes ?? "",
    },
    input.actor,
    input.env,
  );
}

const RESERVATION_EVENT_TO_STATE: Record<string, string> = {
  "reservation.confirm": "confirmed",
  "reservation.cancel": "canceled",
  "reservation.complete": "completed",
  "reservation.no_show": "no_show",
};

export async function transitionReservation(input: {
  pageId: string;
  reservationId: string;
  eventType: keyof typeof RESERVATION_EVENT_TO_STATE;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "reservations", actor: input.actor, env: input.env });
  await publishServiceEvent({
    pageId: input.pageId,
    envelope: {
      stream: "reservations",
      topic: "reservation",
      type: input.eventType,
      entityType: "reservation",
      entityId: input.reservationId,
      payload: { reservationId: input.reservationId, nextState: RESERVATION_EVENT_TO_STATE[input.eventType] },
    },
    dispatch: true,
    actor: input.actor,
  });
  return validateAndUpdateRecord(
    input.pageId,
    "reservations",
    input.reservationId,
    { state: RESERVATION_EVENT_TO_STATE[input.eventType] },
    input.actor,
    input.env,
  );
}

export async function createTicketQueue(input: {
  pageId: string;
  key: string;
  name: string;
  slaHours?: number;
  defaultAssignee?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "tickets", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "ticket_queues",
    {
      key: input.key,
      name: input.name,
      sla_hours: input.slaHours ?? 24,
      default_assignee: input.defaultAssignee ?? "",
    },
    input.actor,
    input.env,
  );
}

export async function createTicket(input: {
  pageId: string;
  queueId: string;
  title: string;
  requesterKey: string;
  body?: string;
  assigneeKey?: string;
  priority?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "tickets", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "tickets",
    {
      queue_id: input.queueId,
      title: input.title,
      body: input.body ?? "",
      requester_key: input.requesterKey,
      assignee_key: input.assigneeKey ?? "",
      priority: normalizeStatus(input.priority, "normal"),
      state: "open",
      tags: [],
    },
    input.actor,
    input.env,
  );
}

const TICKET_EVENT_TO_STATE: Record<string, string> = {
  "ticket.triage": "triaged",
  "ticket.start": "in_progress",
  "ticket.wait_customer": "waiting_customer",
  "ticket.resolve": "resolved",
  "ticket.close": "closed",
};

export async function transitionTicket(input: {
  pageId: string;
  ticketId: string;
  eventType: keyof typeof TICKET_EVENT_TO_STATE;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "tickets", actor: input.actor, env: input.env });
  await publishServiceEvent({
    pageId: input.pageId,
    envelope: {
      stream: "tickets",
      topic: "ticket",
      type: input.eventType,
      entityType: "ticket",
      entityId: input.ticketId,
      payload: { ticketId: input.ticketId, nextState: TICKET_EVENT_TO_STATE[input.eventType] },
    },
    dispatch: true,
    actor: input.actor,
  });
  return validateAndUpdateRecord(
    input.pageId,
    "tickets",
    input.ticketId,
    { state: TICKET_EVENT_TO_STATE[input.eventType] },
    input.actor,
    input.env,
  );
}

export async function addTicketMessage(input: {
  pageId: string;
  ticketId: string;
  body: string;
  authorKey: string;
  visibility?: "public" | "internal";
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "tickets", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "ticket_messages",
    {
      ticket_id: input.ticketId,
      body: input.body,
      author_key: input.authorKey,
      visibility: input.visibility ?? "public",
    },
    input.actor,
    input.env,
  );
}

export async function createApprovalDocument(input: {
  pageId: string;
  key: string;
  title: string;
  body?: string;
  approverKey?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "approvals", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "documents",
    {
      key: input.key,
      title: input.title,
      body: input.body ?? "",
      status: "draft",
      approval_request_id: "",
      approver_key: input.approverKey ?? "",
      version: 1,
    },
    input.actor,
    input.env,
  );
}

export async function submitApprovalDocument(input: {
  pageId: string;
  documentId: string;
  subjectKey: string;
  subjectLabel?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "approvals", actor: input.actor, env: input.env });
  const request = await createServiceApprovalRequest({
    pageId: input.pageId,
    actionKey: "document.publish",
    resourceType: "document",
    subjectKey: input.subjectKey,
    subjectLabel: input.subjectLabel ?? null,
    targetKey: input.documentId,
    context: { documentId: input.documentId },
    actor: input.actor,
  });
  await publishServiceEvent({
    pageId: input.pageId,
    envelope: {
      stream: "documents",
      topic: "document",
      type: "document.submit",
      entityType: "document",
      entityId: input.documentId,
      payload: { documentId: input.documentId, approvalRequestId: request.id },
    },
    dispatch: true,
    actor: input.actor,
  });
  const document = await validateAndUpdateRecord(
    input.pageId,
    "documents",
    input.documentId,
    {
      status: "submitted",
      approval_request_id: request.id,
    },
    input.actor,
    input.env,
  );
  return { document, approvalRequest: request };
}

export async function decideApprovalDocument(input: {
  pageId: string;
  documentId: string;
  requestId: string;
  status: "approved" | "rejected";
  decidedByUserId?: string | null;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "approvals", actor: input.actor, env: input.env });
  const approvalRequest = await decideServiceApprovalRequest({
    pageId: input.pageId,
    requestId: input.requestId,
    status: input.status,
    decidedByUserId: input.decidedByUserId ?? null,
    actor: input.actor,
  });
  const eventType = input.status === "approved" ? "document.approve" : "document.reject";
  await publishServiceEvent({
    pageId: input.pageId,
    envelope: {
      stream: "documents",
      topic: "document",
      type: eventType,
      entityType: "document",
      entityId: input.documentId,
      payload: { documentId: input.documentId, approvalRequestId: input.requestId },
    },
    dispatch: true,
    actor: input.actor,
  });
  const document = await validateAndUpdateRecord(
    input.pageId,
    "documents",
    input.documentId,
    { status: input.status },
    input.actor,
    input.env,
  );
  return { document, approvalRequest };
}

export async function upsertMembershipTier(input: {
  pageId: string;
  key: string;
  name: string;
  description?: string;
  priceCents?: number;
  currency?: string;
  billingPlanKey?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "memberships", actor: input.actor, env: input.env });
  const planKey = input.billingPlanKey ?? input.key;
  await upsertServiceBillingPlan({
    pageId: input.pageId,
    key: planKey,
    name: input.name,
    chargeModel: "subscription",
    billingInterval: "month",
    unitAmountCents: input.priceCents ?? 0,
    currency: input.currency ?? "KRW",
    active: true,
    metadata: { tierKey: input.key },
  });

  const tiers = await listCollectionRecords(input.pageId, "membership_tiers", input.env);
  const existing = tiers.find((item) => asString(item.data.key) === input.key);
  if (existing) {
    return validateAndUpdateRecord(
      input.pageId,
      "membership_tiers",
      existing.id,
      {
        key: input.key,
        name: input.name,
        description: input.description ?? "",
        billing_plan_key: planKey,
        price_cents: input.priceCents ?? 0,
        currency: input.currency ?? "KRW",
        active: true,
      },
      input.actor,
      input.env,
    );
  }
  return validateAndCreateRecord(
    input.pageId,
    "membership_tiers",
    {
      key: input.key,
      name: input.name,
      description: input.description ?? "",
      billing_plan_key: planKey,
      price_cents: input.priceCents ?? 0,
      currency: input.currency ?? "KRW",
      active: true,
    },
    input.actor,
    input.env,
  );
}

export async function assignMembership(input: {
  pageId: string;
  tierId: string;
  subjectKey: string;
  status?: string;
  billingAccountId?: string;
  subscriptionId?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "memberships", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "memberships",
    {
      tier_id: input.tierId,
      subject_key: input.subjectKey,
      status: normalizeStatus(input.status, "active"),
      billing_account_id: input.billingAccountId ?? "",
      subscription_id: input.subscriptionId ?? "",
    },
    input.actor,
    input.env,
  );
}

export async function startMembershipPlanSubscription(input: {
  pageId: string;
  tierId: string;
  subjectKey: string;
  email?: string | null;
  customerName?: string | null;
  quantity?: number;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "memberships", actor: input.actor, env: input.env });
  const tier = await getRecord(input.pageId, "membership_tiers", input.tierId, undefined, input.env ?? "prod");
  if (!tier) throw new Error("tier_not_found");
  const planKey = asString(toObject(tier.data).billing_plan_key) ?? asString(toObject(tier.data).key) ?? "";
  const account = await upsertServiceBillingAccount({
    pageId: input.pageId,
    scopeType: "custom",
    scopeKey: input.subjectKey,
    email: input.email ?? null,
    customerName: input.customerName ?? null,
    metadata: { engine: "memberships", subjectKey: input.subjectKey },
  });
  const billingState = await listServiceBillingState(input.pageId);
  const plan = billingState.plans.find((item) => item.key === planKey);
  if (!plan) throw new Error("billing_plan_not_found");
  const subscription = await startServiceBillingSubscription({
    pageId: input.pageId,
    accountId: account.id,
    planId: plan.id,
    quantity: input.quantity ?? 1,
    metadata: { tierId: input.tierId, subjectKey: input.subjectKey },
  });
  const membership = await assignMembership({
    pageId: input.pageId,
    tierId: input.tierId,
    subjectKey: input.subjectKey,
    status: "active",
    billingAccountId: account.id,
    subscriptionId: subscription.id,
    actor: input.actor,
    env: input.env,
  });
  return { account, subscription, membership };
}

export async function cancelMembershipPlanSubscription(input: {
  pageId: string;
  membershipId: string;
  cancelAtPeriodEnd?: boolean;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  const membership = await getRecord(input.pageId, "memberships", input.membershipId, undefined, input.env ?? "prod");
  if (!membership) throw new Error("membership_not_found");
  const subscriptionId = asString(toObject(membership.data).subscription_id);
  if (!subscriptionId) throw new Error("membership_subscription_not_found");
  const subscription = await cancelServiceBillingSubscription({
    pageId: input.pageId,
    subscriptionId,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
  });
  const record = await validateAndUpdateRecord(
    input.pageId,
    "memberships",
    input.membershipId,
    {
      ...toObject(membership.data),
      status: input.cancelAtPeriodEnd ? "paused" : "canceled",
    },
    input.actor,
    input.env,
  );
  return { subscription, membership: record };
}

export async function createCrmPipeline(input: {
  pageId: string;
  key: string;
  name: string;
  stages?: Array<{ key: string; name: string; order: number; terminal?: boolean }>;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "crm", actor: input.actor, env: input.env });
  const pipeline = await validateAndCreateRecord(
    input.pageId,
    "crm_pipelines",
    { key: input.key, name: input.name },
    input.actor,
    input.env,
  );
  const stages = input.stages ?? [
    { key: "new", name: "New", order: 0 },
    { key: "qualified", name: "Qualified", order: 1 },
    { key: "proposal", name: "Proposal", order: 2 },
    { key: "negotiation", name: "Negotiation", order: 3 },
    { key: "won", name: "Won", order: 4, terminal: true },
    { key: "lost", name: "Lost", order: 5, terminal: true },
  ];
  const createdStages = [];
  for (const stage of stages) {
    createdStages.push(
      await validateAndCreateRecord(
        input.pageId,
        "crm_stages",
        {
          pipeline_id: pipeline.id,
          key: stage.key,
          name: stage.name,
          order: stage.order,
          terminal: stage.terminal ?? false,
        },
        input.actor,
        input.env,
      ),
    );
  }
  return { pipeline, stages: createdStages };
}

export async function createCrmLead(input: {
  pageId: string;
  pipelineId: string;
  stageId: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  value?: number;
  ownerKey?: string;
  notes?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "crm", actor: input.actor, env: input.env });
  return validateAndCreateRecord(
    input.pageId,
    "crm_leads",
    {
      pipeline_id: input.pipelineId,
      stage_id: input.stageId,
      name: input.name,
      company: input.company ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      value: input.value ?? 0,
      status: "new",
      owner_key: input.ownerKey ?? "",
      notes: input.notes ?? "",
    },
    input.actor,
    input.env,
  );
}

export async function moveCrmLead(input: {
  pageId: string;
  leadId: string;
  stageId: string;
  status?: string;
  actor?: AppAuditActor;
  env?: AppEnv;
}) {
  await bootstrapServiceDomainEngine({ pageId: input.pageId, engine: "crm", actor: input.actor, env: input.env });
  return validateAndUpdateRecord(
    input.pageId,
    "crm_leads",
    input.leadId,
    {
      stage_id: input.stageId,
      status: normalizeStatus(input.status, "qualified"),
    },
    input.actor,
    input.env,
  );
}
