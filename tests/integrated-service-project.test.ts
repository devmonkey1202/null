import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)),
  pageSetting: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  page: {
    update: vi.fn(),
  },
  appRecord: {
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
  appUser: {
    findUnique: vi.fn(),
  },
  chatMessage: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  todo: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  note: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  calendarEvent: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  kanbanColumn: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  kanbanCard: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  pageNotification: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  serviceBillingAccount: {
    count: vi.fn(),
  },
  serviceBillingPlan: {
    count: vi.fn(),
  },
  serviceBillingSubscription: {
    count: vi.fn(),
  },
  serviceBillingInvoice: {
    count: vi.fn(),
  },
  servicePolicyRule: {
    count: vi.fn(),
  },
  serviceGeoPlace: {
    count: vi.fn(),
  },
  serviceGeoRegion: {
    count: vi.fn(),
  },
}));

const createDraftPageMock = vi.hoisted(() => vi.fn());
const savePageVersionMock = vi.hoisted(() => vi.fn());
const registerAppUserMock = vi.hoisted(() => vi.fn());
const setAppUserRoleMock = vi.hoisted(() => vi.fn());
const bootstrapAllServiceDomainEnginesMock = vi.hoisted(() => vi.fn());
const createServiceFeedPostMock = vi.hoisted(() => vi.fn());
const createServiceCommentThreadMock = vi.hoisted(() => vi.fn());
const createServiceCommentMock = vi.hoisted(() => vi.fn());
const toggleServiceReactionMock = vi.hoisted(() => vi.fn());
const createReservationResourceMock = vi.hoisted(() => vi.fn());
const createReservationMock = vi.hoisted(() => vi.fn());
const transitionReservationMock = vi.hoisted(() => vi.fn());
const createTicketQueueMock = vi.hoisted(() => vi.fn());
const createTicketMock = vi.hoisted(() => vi.fn());
const addTicketMessageMock = vi.hoisted(() => vi.fn());
const createApprovalDocumentMock = vi.hoisted(() => vi.fn());
const submitApprovalDocumentMock = vi.hoisted(() => vi.fn());
const decideApprovalDocumentMock = vi.hoisted(() => vi.fn());
const upsertMembershipTierMock = vi.hoisted(() => vi.fn());
const startMembershipPlanSubscriptionMock = vi.hoisted(() => vi.fn());
const createCrmPipelineMock = vi.hoisted(() => vi.fn());
const createCrmLeadMock = vi.hoisted(() => vi.fn());
const moveCrmLeadMock = vi.hoisted(() => vi.fn());
const upsertServiceNotificationPreferenceMock = vi.hoisted(() => vi.fn());
const queueServiceNotificationsMock = vi.hoisted(() => vi.fn());
const dispatchQueuedServiceNotificationsMock = vi.hoisted(() => vi.fn());
const createServiceBillingChargeMock = vi.hoisted(() => vi.fn());
const generateServiceBillingInvoiceMock = vi.hoisted(() => vi.fn());
const markServiceBillingInvoicePaidMock = vi.hoisted(() => vi.fn());
const runServiceBillingSettlementMock = vi.hoisted(() => vi.fn());
const upsertServiceGeoPlaceMock = vi.hoisted(() => vi.fn());
const upsertServiceGeoRegionMock = vi.hoisted(() => vi.fn());
const buildIntegratedServiceDocMock = vi.hoisted(() => vi.fn());
const buildIntegratedServiceThumbnailDataUrlMock = vi.hoisted(() => vi.fn());
const cloneDevToProdMock = vi.hoisted(() => vi.fn());
const computeDeployHashMock = vi.hoisted(() => vi.fn());
const setProdVersionMetaMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/pages", () => ({
  createDraftPage: createDraftPageMock,
  savePageVersion: savePageVersionMock,
}));
vi.mock("@/lib/app-auth", () => ({
  registerAppUser: registerAppUserMock,
  setAppUserRole: setAppUserRoleMock,
}));
vi.mock("@/lib/service-domain-engines", () => ({
  bootstrapAllServiceDomainEngines: bootstrapAllServiceDomainEnginesMock,
  createServiceFeedPost: createServiceFeedPostMock,
  createServiceCommentThread: createServiceCommentThreadMock,
  createServiceComment: createServiceCommentMock,
  toggleServiceReaction: toggleServiceReactionMock,
  createReservationResource: createReservationResourceMock,
  createReservation: createReservationMock,
  transitionReservation: transitionReservationMock,
  createTicketQueue: createTicketQueueMock,
  createTicket: createTicketMock,
  addTicketMessage: addTicketMessageMock,
  createApprovalDocument: createApprovalDocumentMock,
  submitApprovalDocument: submitApprovalDocumentMock,
  decideApprovalDocument: decideApprovalDocumentMock,
  upsertMembershipTier: upsertMembershipTierMock,
  startMembershipPlanSubscription: startMembershipPlanSubscriptionMock,
  createCrmPipeline: createCrmPipelineMock,
  createCrmLead: createCrmLeadMock,
  moveCrmLead: moveCrmLeadMock,
}));
vi.mock("@/lib/service-notifications", () => ({
  appUserRecipientKey: (id: string) => `app_user:${id}`,
  upsertServiceNotificationPreference: upsertServiceNotificationPreferenceMock,
  queueServiceNotifications: queueServiceNotificationsMock,
  dispatchQueuedServiceNotifications: dispatchQueuedServiceNotificationsMock,
}));
vi.mock("@/lib/service-billing", () => ({
  createServiceBillingCharge: createServiceBillingChargeMock,
  generateServiceBillingInvoice: generateServiceBillingInvoiceMock,
  markServiceBillingInvoicePaid: markServiceBillingInvoicePaidMock,
  runServiceBillingSettlement: runServiceBillingSettlementMock,
}));
vi.mock("@/lib/service-geo", () => ({
  upsertServiceGeoPlace: upsertServiceGeoPlaceMock,
  upsertServiceGeoRegion: upsertServiceGeoRegionMock,
}));
vi.mock("@/lib/integrated-service-template", () => ({
  INTEGRATED_SERVICE_PROJECT_TITLE: "NULL 통합 검증 서비스",
  buildIntegratedServiceDoc: buildIntegratedServiceDocMock,
  buildIntegratedServiceThumbnailDataUrl: buildIntegratedServiceThumbnailDataUrlMock,
}));
vi.mock("@/lib/app-env", () => ({
  cloneDevToProd: cloneDevToProdMock,
  computeDeployHash: computeDeployHashMock,
  setProdVersionMeta: setProdVersionMetaMock,
  toEnvSlug: (slug: string, env: "dev" | "prod") => (env === "prod" ? slug : `${slug}__dev`),
}));

import { ensureIntegratedServiceProject } from "@/lib/integrated-service-project";

const appUsers = new Map<string, { id: string; page_id: string; email: string; display_name: string | null; role: string }>();

function seedUser(pageId: string, email: string, displayName: string, role: string) {
  const id = `app_${appUsers.size + 1}`;
  const user = { id, page_id: pageId, email, display_name: displayName, role };
  appUsers.set(id, user);
  appUsers.set(`${pageId}:${email}`, user);
  return user;
}

describe("integrated service project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appUsers.clear();

    buildIntegratedServiceDocMock.mockReturnValue({ root: "doc" });
    buildIntegratedServiceThumbnailDataUrlMock.mockReturnValue("data:image/svg+xml;charset=utf-8,%3Csvg%3E");
    createDraftPageMock.mockResolvedValue({ page: { id: "page_new" }, version: { id: "version_1" } });
    savePageVersionMock.mockResolvedValue({ id: "version_2", content_json: { root: "doc" } });
    cloneDevToProdMock.mockResolvedValue({ collections: 0, records: 0 });
    computeDeployHashMock.mockReturnValue("deploy_hash_1");
    setProdVersionMetaMock.mockResolvedValue(undefined);
    prismaMock.page.update.mockResolvedValue({ id: "page_new" });
    prismaMock.pageSetting.upsert.mockResolvedValue({ id: "setting_1" });
    prismaMock.chatMessage.createMany.mockResolvedValue({ count: 3 });
    prismaMock.chatMessage.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.todo.createMany.mockResolvedValue({ count: 4 });
    prismaMock.todo.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.note.upsert.mockResolvedValue({ id: "note_1" });
    prismaMock.note.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.calendarEvent.createMany.mockResolvedValue({ count: 3 });
    prismaMock.calendarEvent.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.kanbanColumn.create
      .mockResolvedValueOnce({ id: "column_backlog" })
      .mockResolvedValueOnce({ id: "column_doing" })
      .mockResolvedValueOnce({ id: "column_done" });
    prismaMock.kanbanColumn.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.kanbanCard.createMany.mockResolvedValue({ count: 4 });
    prismaMock.kanbanCard.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.pageNotification.createMany.mockResolvedValue({ count: 3 });
    prismaMock.pageNotification.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.appRecord.count.mockResolvedValue(0);
    prismaMock.appRecord.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.serviceBillingAccount.count.mockResolvedValue(1);
    prismaMock.serviceBillingPlan.count.mockResolvedValue(1);
    prismaMock.serviceBillingSubscription.count.mockResolvedValue(1);
    prismaMock.serviceBillingInvoice.count.mockResolvedValue(1);
    prismaMock.servicePolicyRule.count.mockResolvedValue(1);
    prismaMock.serviceGeoPlace.count.mockResolvedValue(1);
    prismaMock.serviceGeoRegion.count.mockResolvedValue(1);

    prismaMock.appUser.findUnique.mockImplementation(async ({ where }: { where: { id?: string; page_id_email?: { page_id: string; email: string } } }) => {
      if (where.id) return appUsers.get(where.id) ?? null;
      if (where.page_id_email) return appUsers.get(`${where.page_id_email.page_id}:${where.page_id_email.email}`) ?? null;
      return null;
    });

    registerAppUserMock.mockImplementation(async (pageId: string, email: string, _password: string, displayName?: string) => {
      const user = seedUser(pageId, email, displayName ?? email, appUsers.size === 0 ? "admin" : "user");
      return { user, token: `token_${user.id}` };
    });
    setAppUserRoleMock.mockImplementation(async (userId: string, role: string) => {
      const existing = appUsers.get(userId);
      if (existing) {
        const updated = { ...existing, role };
        appUsers.set(userId, updated);
        appUsers.set(`${existing.page_id}:${existing.email}`, updated);
      }
      return null;
    });

    bootstrapAllServiceDomainEnginesMock.mockResolvedValue([]);
    createServiceFeedPostMock.mockResolvedValueOnce({ id: "feed_1" }).mockResolvedValueOnce({ id: "feed_2" });
    createServiceCommentThreadMock.mockResolvedValue({ id: "thread_1" });
    createServiceCommentMock.mockResolvedValueOnce({ id: "comment_1" }).mockResolvedValueOnce({ id: "comment_2" });
    toggleServiceReactionMock.mockResolvedValue({ toggled: "created", reactionId: "reaction_1" });
    createReservationResourceMock.mockResolvedValue({ id: "resource_1" });
    createReservationMock.mockResolvedValueOnce({ id: "reservation_1" }).mockResolvedValueOnce({ id: "reservation_2" });
    transitionReservationMock.mockResolvedValue({ id: "reservation_1" });
    createTicketQueueMock.mockResolvedValue({ id: "queue_1" });
    createTicketMock.mockResolvedValue({ id: "ticket_1" });
    addTicketMessageMock.mockResolvedValue({ id: "ticket_message_1" });
    createApprovalDocumentMock
      .mockResolvedValueOnce({ id: "document_1" })
      .mockResolvedValueOnce({ id: "document_2" });
    submitApprovalDocumentMock
      .mockResolvedValueOnce({ approvalRequest: { id: "approval_1" }, document: { id: "document_1" } })
      .mockResolvedValueOnce({ approvalRequest: { id: "approval_2" }, document: { id: "document_2" } });
    decideApprovalDocumentMock.mockResolvedValue({ approvalRequest: { id: "approval_1", status: "approved" }, document: { id: "document_1" } });
    upsertMembershipTierMock.mockResolvedValue({ id: "tier_1" });
    startMembershipPlanSubscriptionMock.mockResolvedValue({
      account: { id: "account_1" },
      subscription: { id: "subscription_1" },
      membership: { id: "membership_1" },
    });
    createServiceBillingChargeMock.mockResolvedValue({ id: "charge_1" });
    generateServiceBillingInvoiceMock.mockResolvedValue({ id: "invoice_1" });
    markServiceBillingInvoicePaidMock.mockResolvedValue({ id: "invoice_1", status: "paid" });
    runServiceBillingSettlementMock.mockResolvedValue({ id: "settlement_1" });
    createCrmPipelineMock.mockResolvedValue({
      pipeline: { id: "pipeline_1" },
      stages: [
        { id: "stage_new", data: { key: "new" } },
        { id: "stage_qualified", data: { key: "qualified" } },
      ],
    });
    createCrmLeadMock.mockResolvedValue({ id: "lead_1" });
    moveCrmLeadMock.mockResolvedValue({ id: "lead_1" });
    upsertServiceGeoPlaceMock.mockResolvedValue({ id: "geo_place_1" });
    upsertServiceGeoRegionMock.mockResolvedValue({ id: "geo_region_1" });
    upsertServiceNotificationPreferenceMock.mockResolvedValue({ id: "pref_1" });
    queueServiceNotificationsMock.mockResolvedValue({ queued: 2, sent: 0, failed: 0, skipped: 0 });
    dispatchQueuedServiceNotificationsMock.mockResolvedValue({ queued: 2, sent: 2, failed: 0, skipped: 0 });
  });

  it("reuses an existing integrated service project for the owner", async () => {
    prismaMock.pageSetting.findFirst.mockResolvedValue({
      page_id: "page_existing",
      page: { id: "page_existing", title: "NULL 통합 검증 서비스" },
    });
    prismaMock.pageSetting.findMany.mockResolvedValue([
      {
        key: "system.integrated_validation_service.accounts",
        value: [
          {
            label: "운영 관리자",
            role: "admin",
            email: "admin+exist@null.local",
            password: "NullDemo!2026",
            displayName: "NULL 운영 관리자",
          },
        ],
      },
    ]);
    prismaMock.appRecord.count.mockResolvedValue(0);
    prismaMock.serviceBillingAccount.count.mockResolvedValue(0);
    prismaMock.serviceBillingPlan.count.mockResolvedValue(0);
    prismaMock.serviceBillingSubscription.count.mockResolvedValue(0);
    prismaMock.serviceBillingInvoice.count.mockResolvedValue(0);
    prismaMock.servicePolicyRule.count.mockResolvedValue(0);
    prismaMock.serviceGeoPlace.count.mockResolvedValue(0);
    prismaMock.serviceGeoRegion.count.mockResolvedValue(0);

    const result = await ensureIntegratedServiceProject({ ownerId: "owner_1", userId: "owner_1", anonId: "anon_1" });

    expect(result.created).toBe(false);
    expect(result.pageId).toBe("page_existing");
    expect(result.publicUrl).toBe("/p/page_existing");
    expect(result.validationUrl).toBe("/validate/page_existing");
    expect(createDraftPageMock).not.toHaveBeenCalled();
    expect(bootstrapAllServiceDomainEnginesMock).toHaveBeenCalledTimes(1);
    expect(createReservationResourceMock).toHaveBeenCalledTimes(1);
    expect(createTicketQueueMock).toHaveBeenCalledTimes(1);
    expect(createApprovalDocumentMock).toHaveBeenCalledTimes(2);
    expect(upsertMembershipTierMock).toHaveBeenCalledTimes(1);
    expect(createCrmPipelineMock).toHaveBeenCalledTimes(1);
    expect(savePageVersionMock).toHaveBeenCalledTimes(1);
    expect(cloneDevToProdMock).toHaveBeenCalledTimes(1);
    expect(setProdVersionMetaMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.chatMessage.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.todo.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.pageSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          page_id_key: {
            page_id: "page_existing",
            key: "system.integrated_validation_service.accounts",
          },
        },
      }),
    );
  });

  it("creates, seeds, and annotates a new integrated service project", async () => {
    prismaMock.pageSetting.findFirst.mockResolvedValue(null);
    prismaMock.pageSetting.findMany.mockResolvedValue([]);

    const result = await ensureIntegratedServiceProject({ ownerId: "owner_1", userId: "owner_1", anonId: "anon_1" });

    expect(result.created).toBe(true);
    expect(result.pageId).toBe("page_new");
    expect(result.publicUrl).toBe("/p/page_new");
    expect(result.validationUrl).toBe("/validate/page_new");
    expect(result.credentials).toHaveLength(3);
    expect(createDraftPageMock).toHaveBeenCalledWith({
      ownerId: "owner_1",
      title: "NULL 통합 검증 서비스",
      contentJson: { root: "doc" },
    });
    expect(prismaMock.page.update).toHaveBeenCalled();
    expect(bootstrapAllServiceDomainEnginesMock).toHaveBeenCalledTimes(1);
    expect(createServiceFeedPostMock).toHaveBeenCalledTimes(2);
    expect(createReservationResourceMock).toHaveBeenCalledTimes(1);
    expect(createTicketQueueMock).toHaveBeenCalledTimes(1);
    expect(createApprovalDocumentMock).toHaveBeenCalledTimes(2);
    expect(upsertMembershipTierMock).toHaveBeenCalledTimes(1);
    expect(createCrmPipelineMock).toHaveBeenCalledTimes(1);
    expect(upsertServiceGeoRegionMock).toHaveBeenCalledTimes(1);
    expect(queueServiceNotificationsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.chatMessage.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.chatMessage.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.todo.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.todo.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.note.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.note.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.calendarEvent.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.calendarEvent.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.kanbanColumn.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.kanbanColumn.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.kanbanCard.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.kanbanCard.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.pageNotification.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.pageNotification.deleteMany).toHaveBeenCalledTimes(1);
    expect(savePageVersionMock).toHaveBeenCalledTimes(1);
    expect(buildIntegratedServiceDocMock).toHaveBeenCalledTimes(2);
    expect(buildIntegratedServiceDocMock.mock.calls[1]?.[0]).toMatchObject({
      credentials: expect.arrayContaining([
        expect.objectContaining({
          label: "운영 관리자",
          password: "NullDemo!2026",
        }),
      ]),
    });
    expect(cloneDevToProdMock).toHaveBeenCalledTimes(1);
    expect(setProdVersionMetaMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.pageSetting.upsert).toHaveBeenCalledTimes(3);
  });
});
