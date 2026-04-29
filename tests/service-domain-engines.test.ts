import { beforeEach, describe, expect, it, vi } from "vitest";

const appDataMock = vi.hoisted(() => ({
  createRecord: vi.fn(),
  getCollectionBySlug: vi.fn(),
  getCollections: vi.fn(),
  getRecord: vi.fn(),
  listRecords: vi.fn(),
  setSchema: vi.fn(),
  updateRecord: vi.fn(),
  validateRecordData: vi.fn(),
  validateRelationTargets: vi.fn(),
}));

const policyMock = vi.hoisted(() => ({
  createServiceApprovalRequest: vi.fn(),
  decideServiceApprovalRequest: vi.fn(),
  listServicePolicyState: vi.fn(),
  upsertServicePolicyRule: vi.fn(),
}));

const rankingMock = vi.hoisted(() => ({
  assembleServiceFeed: vi.fn(),
  ensureDefaultServiceRankingRules: vi.fn(),
  syncServiceRankingRecord: vi.fn(),
}));

const stateMachineMock = vi.hoisted(() => ({
  createServiceStateMachine: vi.fn(),
  listServiceStateMachines: vi.fn(),
  updateServiceStateMachine: vi.fn(),
}));

const billingMock = vi.hoisted(() => ({
  cancelServiceBillingSubscription: vi.fn(),
  listServiceBillingState: vi.fn(),
  startServiceBillingSubscription: vi.fn(),
  upsertServiceBillingAccount: vi.fn(),
  upsertServiceBillingPlan: vi.fn(),
}));

const searchMock = vi.hoisted(() => ({
  ensureDefaultServiceSearchIndices: vi.fn(),
  syncServiceSearchRecord: vi.fn(),
}));

const eventBusMock = vi.hoisted(() => ({
  publishServiceEvent: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  serviceStateMachine: { findFirst: vi.fn() },
  appRecord: { delete: vi.fn() },
}));

vi.mock("@/lib/app-data", () => appDataMock);
vi.mock("@/lib/service-policy", () => policyMock);
vi.mock("@/lib/service-ranking", () => rankingMock);
vi.mock("@/lib/service-state-machine", () => stateMachineMock);
vi.mock("@/lib/service-billing", () => billingMock);
vi.mock("@/lib/service-search", () => searchMock);
vi.mock("@/lib/service-event-bus", () => eventBusMock);
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  bootstrapAllServiceDomainEngines,
  createServiceFeedPost,
  decideApprovalDocument,
  queryServiceFeedEngine,
  submitApprovalDocument,
  transitionTicket,
  startMembershipPlanSubscription,
  transitionReservation,
  moveCrmLead,
} from "@/lib/service-domain-engines";

describe("service domain engines", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    appDataMock.getCollectionBySlug.mockResolvedValue({ strict: true, fields: [] });
    appDataMock.getCollections.mockResolvedValue([
      { slug: "feed_posts" },
      { slug: "comment_threads" },
      { slug: "comment_entries" },
      { slug: "comment_reactions" },
      { slug: "reservation_resources" },
      { slug: "reservations" },
      { slug: "ticket_queues" },
      { slug: "tickets" },
      { slug: "ticket_messages" },
      { slug: "documents" },
      { slug: "membership_tiers" },
      { slug: "memberships" },
      { slug: "crm_pipelines" },
      { slug: "crm_stages" },
      { slug: "crm_leads" },
    ]);
    appDataMock.validateRecordData.mockImplementation((_fields: unknown, data: Record<string, unknown>) => ({
      data,
      errors: [],
    }));
    appDataMock.validateRelationTargets.mockResolvedValue({ ok: true, missing: [] });
    appDataMock.createRecord.mockImplementation(async (_pageId: string, _slug: string, data: Record<string, unknown>) => ({
      id: `rec_${String(data.title ?? data.key ?? data.name ?? "1")}`,
      data,
      created_at: new Date("2026-03-23T00:00:00.000Z"),
      updated_at: new Date("2026-03-23T00:00:00.000Z"),
    }));
    appDataMock.updateRecord.mockImplementation(async (_pageId: string, _slug: string, id: string, data: Record<string, unknown>) => ({
      id,
      data,
      created_at: new Date("2026-03-23T00:00:00.000Z"),
      updated_at: new Date("2026-03-23T00:00:00.000Z"),
    }));
    appDataMock.getRecord.mockImplementation(
      async (_pageId: string, slug: string, id: string) => {
        const base = {
          created_at: new Date("2026-03-23T00:00:00.000Z"),
          updated_at: new Date("2026-03-23T00:00:00.000Z"),
        };
        if (slug === "membership_tiers" && id === "tier_1") {
          return {
            id,
            data: {
              key: "gold",
              name: "Gold",
              description: "",
              billing_plan_key: "gold",
              price_cents: 9900,
              currency: "KRW",
              active: true,
            },
            ...base,
          };
        }
        if (slug === "documents" && id === "doc_1") {
          return {
            id,
            data: {
              key: "policy-doc",
              title: "Policy",
              body: "",
              status: "draft",
              approval_request_id: "",
              approver_key: "",
              version: 1,
            },
            ...base,
          };
        }
        if (slug === "reservations" && id === "reservation_1") {
          return {
            id,
            data: {
              resource_id: "resource_1",
              title: "Consulting",
              customer_key: "customer_1",
              starts_at: "2026-03-24T09:00:00.000Z",
              ends_at: "2026-03-24T10:00:00.000Z",
              state: "requested",
              notes: "",
            },
            ...base,
          };
        }
        if (slug === "memberships" && id === "membership_1") {
          return {
            id,
            data: {
              tier_id: "tier_1",
              subject_key: "member:alpha",
              status: "active",
              billing_account_id: "account_1",
              subscription_id: "sub_1",
            },
            ...base,
          };
        }
        if (slug === "crm_leads" && id === "lead_1") {
          return {
            id,
            data: {
              pipeline_id: "pipeline_1",
              stage_id: "stage_1",
              name: "Alpha Lead",
              company: "Alpha",
              email: "alpha@example.com",
              phone: "",
              value: 10000,
              status: "new",
              owner_key: "owner_1",
              notes: "",
            },
            ...base,
          };
        }
        return {
          id,
          data: { key: "gold", billing_plan_key: "gold", subscription_id: "sub_1", status: "active" },
          ...base,
        };
      },
    );
    appDataMock.listRecords.mockResolvedValue({
      items: [],
      total: 0,
      limit: 500,
      offset: 0,
    });

    policyMock.listServicePolicyState.mockResolvedValue({ rules: [{ key: "document_publish_review" }] });
    policyMock.upsertServicePolicyRule.mockResolvedValue({ id: "rule_1", key: "document_publish_review" });
    policyMock.createServiceApprovalRequest.mockResolvedValue({ id: "approval_1", status: "requested" });
    policyMock.decideServiceApprovalRequest.mockResolvedValue({ id: "approval_1", status: "approved" });

    rankingMock.ensureDefaultServiceRankingRules.mockResolvedValue(undefined);
    rankingMock.syncServiceRankingRecord.mockResolvedValue(["collection:feed_posts:default"]);
    rankingMock.assembleServiceFeed.mockResolvedValue({ items: [{ id: "feed_item_1" }], total: 1, limit: 20, offset: 0 });

    stateMachineMock.listServiceStateMachines.mockResolvedValue([
      { key: "reservation_default" },
      { key: "ticket_default" },
      { key: "document_approval_default" },
    ]);
    stateMachineMock.createServiceStateMachine.mockResolvedValue({ id: "machine_1" });
    stateMachineMock.updateServiceStateMachine.mockResolvedValue({ id: "machine_1" });
    prismaMock.serviceStateMachine.findFirst.mockResolvedValue(null);

    billingMock.listServiceBillingState.mockResolvedValue({ plans: [{ id: "plan_1", key: "gold" }, { id: "plan_2", key: "membership_default" }] });
    billingMock.upsertServiceBillingPlan.mockResolvedValue({ id: "plan_2", key: "membership_default" });
    billingMock.upsertServiceBillingAccount.mockResolvedValue({ id: "account_1" });
    billingMock.startServiceBillingSubscription.mockResolvedValue({ id: "sub_1", status: "active" });
    billingMock.cancelServiceBillingSubscription.mockResolvedValue({ id: "sub_1", status: "canceled" });

    searchMock.ensureDefaultServiceSearchIndices.mockResolvedValue(undefined);
    searchMock.syncServiceSearchRecord.mockResolvedValue(undefined);

    eventBusMock.publishServiceEvent.mockResolvedValue({ ok: true });
  });

  it("bootstraps all domain engines with shared infra", async () => {
    const result = await bootstrapAllServiceDomainEngines({ pageId: "page_1", actor: { userId: "user_1" } });

    expect(appDataMock.setSchema).toHaveBeenCalledTimes(7);
    expect(searchMock.ensureDefaultServiceSearchIndices).toHaveBeenCalledWith("page_1");
    expect(rankingMock.ensureDefaultServiceRankingRules).toHaveBeenCalledWith("page_1");
    expect(result.every((engine) => engine.ready)).toBe(true);
  });

  it("creates feed posts and queries the assembled feed", async () => {
    const post = await createServiceFeedPost({
      pageId: "page_1",
      title: "Hello",
      body: "World",
      actor: { userId: "user_1" },
    });

    expect(post.id).toBe("rec_Hello");
    expect(appDataMock.createRecord).toHaveBeenCalledWith(
      "page_1",
      "feed_posts",
      expect.objectContaining({ title: "Hello" }),
      expect.objectContaining({ userId: "user_1" }),
      undefined,
      "prod",
    );
    expect(searchMock.syncServiceSearchRecord).toHaveBeenCalled();
    expect(rankingMock.syncServiceRankingRecord).toHaveBeenCalled();

    const feed = await queryServiceFeedEngine({ pageId: "page_1" });
    expect(feed.items).toHaveLength(1);
    expect(rankingMock.assembleServiceFeed).toHaveBeenCalledWith(
      "page_1",
      expect.objectContaining({
        ruleWeights: [{ ruleKey: "collection:feed_posts:default", weight: 1 }],
      }),
      expect.objectContaining({ isOwner: true }),
    );
  });

  it("submits approval documents through approval requests", async () => {
    const result = await submitApprovalDocument({
      pageId: "page_1",
      documentId: "doc_1",
      subjectKey: "owner:user_1",
      actor: { userId: "user_1" },
    });

    expect(policyMock.createServiceApprovalRequest).toHaveBeenCalled();
    expect(eventBusMock.publishServiceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({ type: "document.submit", entityId: "doc_1" }),
      }),
    );
    expect(appDataMock.updateRecord).toHaveBeenCalledWith(
      "page_1",
      "documents",
      "doc_1",
      expect.objectContaining({ status: "submitted", approval_request_id: "approval_1" }),
      { replace: true },
      expect.objectContaining({ userId: "user_1" }),
      "prod",
    );
    expect(result.approvalRequest.id).toBe("approval_1");
  });

  it("transitions reservations through the shared event bus", async () => {
    await transitionReservation({
      pageId: "page_1",
      reservationId: "reservation_1",
      eventType: "reservation.confirm",
      actor: { userId: "user_1" },
    });

    expect(eventBusMock.publishServiceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({ type: "reservation.confirm", entityId: "reservation_1" }),
      }),
    );
    expect(appDataMock.updateRecord).toHaveBeenCalledWith(
      "page_1",
      "reservations",
      "reservation_1",
      expect.objectContaining({ state: "confirmed" }),
      { replace: true },
      expect.objectContaining({ userId: "user_1" }),
      "prod",
    );
  });

  it("transitions tickets through the shared event bus", async () => {
    await transitionTicket({
      pageId: "page_1",
      ticketId: "ticket_1",
      eventType: "ticket.resolve",
      actor: { userId: "user_1" },
    });

    expect(eventBusMock.publishServiceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({ type: "ticket.resolve", entityId: "ticket_1" }),
      }),
    );
    expect(appDataMock.updateRecord).toHaveBeenCalledWith(
      "page_1",
      "tickets",
      "ticket_1",
      expect.objectContaining({ state: "resolved" }),
      { replace: true },
      expect.objectContaining({ userId: "user_1" }),
      "prod",
    );
  });

  it("decides approval documents through approval requests and publishes the transition", async () => {
    const result = await decideApprovalDocument({
      pageId: "page_1",
      documentId: "doc_1",
      requestId: "approval_1",
      status: "approved",
      decidedByUserId: "user_1",
      actor: { userId: "user_1" },
    });

    expect(policyMock.decideServiceApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page_1",
        requestId: "approval_1",
        status: "approved",
        decidedByUserId: "user_1",
      }),
    );
    expect(eventBusMock.publishServiceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({ type: "document.approve", entityId: "doc_1" }),
      }),
    );
    expect(appDataMock.updateRecord).toHaveBeenCalledWith(
      "page_1",
      "documents",
      "doc_1",
      expect.objectContaining({ status: "approved" }),
      { replace: true },
      expect.objectContaining({ userId: "user_1" }),
      "prod",
    );
    expect(result.approvalRequest.status).toBe("approved");
  });

  it("starts membership subscriptions through billing", async () => {
    const result = await startMembershipPlanSubscription({
      pageId: "page_1",
      tierId: "tier_1",
      subjectKey: "member:alpha",
      email: "alpha@example.com",
      customerName: "Alpha",
      actor: { userId: "user_1" },
    });

    expect(billingMock.upsertServiceBillingAccount).toHaveBeenCalled();
    expect(billingMock.startServiceBillingSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "page_1", accountId: "account_1", planId: "plan_1" }),
    );
    expect(appDataMock.createRecord).toHaveBeenCalledWith(
      "page_1",
      "memberships",
      expect.objectContaining({ subject_key: "member:alpha", subscription_id: "sub_1" }),
      expect.objectContaining({ userId: "user_1" }),
      undefined,
      "prod",
    );
    expect(result.subscription.id).toBe("sub_1");
  });

  it("moves crm leads between stages", async () => {
    await moveCrmLead({
      pageId: "page_1",
      leadId: "lead_1",
      stageId: "stage_2",
      status: "proposal",
      actor: { userId: "user_1" },
    });

    expect(appDataMock.updateRecord).toHaveBeenCalledWith(
      "page_1",
      "crm_leads",
      "lead_1",
      expect.objectContaining({ stage_id: "stage_2", status: "proposal" }),
      { replace: true },
      expect.objectContaining({ userId: "user_1" }),
      "prod",
    );
  });
});
