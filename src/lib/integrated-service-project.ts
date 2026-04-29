import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { createDraftPage, savePageVersion } from "@/lib/pages";
import { registerAppUser, setAppUserRole } from "@/lib/app-auth";
import type { AppAuditActor } from "@/lib/app-audit";
import { cloneDevToProd, computeDeployHash, setProdVersionMeta, toEnvSlug, type AppEnv } from "@/lib/app-env";
import {
  bootstrapAllServiceDomainEngines,
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
  addTicketMessage,
  decideApprovalDocument,
  moveCrmLead,
  startMembershipPlanSubscription,
  submitApprovalDocument,
  toggleServiceReaction,
  transitionReservation,
  upsertMembershipTier,
} from "@/lib/service-domain-engines";
import { appUserRecipientKey, dispatchQueuedServiceNotifications, queueServiceNotifications, upsertServiceNotificationPreference } from "@/lib/service-notifications";
import { createServiceBillingCharge, generateServiceBillingInvoice, markServiceBillingInvoicePaid, runServiceBillingSettlement } from "@/lib/service-billing";
import { upsertServiceGeoPlace, upsertServiceGeoRegion } from "@/lib/service-geo";
import { buildIntegratedServiceDoc, buildIntegratedServiceThumbnailDataUrl, INTEGRATED_SERVICE_PROJECT_TITLE } from "@/lib/integrated-service-template";

export const INTEGRATED_SERVICE_PROJECT_MARKER_KEY = "system.integrated_validation_service";
const INTEGRATED_SERVICE_PROJECT_META_KEY = "system.integrated_validation_service.meta";
const INTEGRATED_SERVICE_PROJECT_ACCOUNTS_KEY = "system.integrated_validation_service.accounts";
const INTEGRATED_SERVICE_PROJECT_PASSWORD = "NullDemo!2026";
const REQUIRED_DOMAIN_COLLECTION_SLUGS = [
  "reservation_resources",
  "reservations",
  "tickets",
  "ticket_messages",
  "crm_stages",
  "crm_leads",
  "documents",
] as const;
const SCENARIO_RECORD_COLLECTION_SLUGS = [
  "feed_posts",
  "comment_threads",
  "comment_entries",
  "comment_reactions",
  "reservation_resources",
  "reservations",
  "ticket_queues",
  "tickets",
  "ticket_messages",
  "documents",
  "membership_tiers",
  "memberships",
  "crm_pipelines",
  "crm_stages",
  "crm_leads",
] as const;

export type IntegratedServiceSeedAccount = {
  label: string;
  role: string;
  email: string;
  password: string;
  displayName: string;
};

export type EnsureIntegratedServiceProjectResult = {
  pageId: string;
  created: boolean;
  title: string;
  editorUrl: string;
  dashboardUrl: string;
  publicUrl: string;
  validationUrl: string;
  credentials: IntegratedServiceSeedAccount[];
};

function buildSeedAccounts(pageId: string): IntegratedServiceSeedAccount[] {
  const suffix = pageId.slice(-6).toLowerCase();
  return [
    {
      label: "운영 관리자",
      role: "admin",
      email: `admin+${suffix}@null.local`,
      password: INTEGRATED_SERVICE_PROJECT_PASSWORD,
      displayName: "NULL 운영 관리자",
    },
    {
      label: "파트너 운영자",
      role: "editor",
      email: `partner+${suffix}@null.local`,
      password: INTEGRATED_SERVICE_PROJECT_PASSWORD,
      displayName: "강남 라이브랩 파트너 운영자",
    },
    {
      label: "일반 사용자",
      role: "user",
      email: `member+${suffix}@null.local`,
      password: INTEGRATED_SERVICE_PROJECT_PASSWORD,
      displayName: "일반 사용자 데모 계정",
    },
  ];
}

function toRouteResult(pageId: string, created: boolean, credentials: IntegratedServiceSeedAccount[]): EnsureIntegratedServiceProjectResult {
  return {
    pageId,
    created,
    title: INTEGRATED_SERVICE_PROJECT_TITLE,
    editorUrl: `/editor/advanced?pageId=${pageId}`,
    dashboardUrl: `/dashboard/${pageId}`,
    publicUrl: `/p/${pageId}`,
    validationUrl: `/validate/${pageId}`,
    credentials,
  };
}

function parseStoredAccounts(value: unknown): IntegratedServiceSeedAccount[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (
        typeof record.label !== "string" ||
        typeof record.role !== "string" ||
        typeof record.email !== "string" ||
        typeof record.password !== "string" ||
        typeof record.displayName !== "string"
      ) {
        return null;
      }
      return {
        label: record.label,
        role: record.role,
        email: record.email,
        password: record.password,
        displayName: record.displayName,
      } satisfies IntegratedServiceSeedAccount;
    })
    .filter((entry): entry is IntegratedServiceSeedAccount => Boolean(entry));
}

function normalizeSeedAccounts(pageId: string, credentials: IntegratedServiceSeedAccount[]) {
  const defaults = buildSeedAccounts(pageId);
  if (!credentials.length) return defaults;
  const byLabel = new Map(credentials.map((entry) => [entry.label, entry] as const));
  const byEmail = new Map(credentials.map((entry) => [entry.email.toLowerCase(), entry] as const));
  return defaults.map((fallback) => byLabel.get(fallback.label) ?? byEmail.get(fallback.email.toLowerCase()) ?? fallback);
}

async function persistIntegratedServiceAccounts(pageId: string, credentials: IntegratedServiceSeedAccount[]) {
  await prisma.pageSetting.upsert({
    where: {
      page_id_key: {
        page_id: pageId,
        key: INTEGRATED_SERVICE_PROJECT_ACCOUNTS_KEY,
      },
    },
    update: {
      value: credentials,
    },
    create: {
      page_id: pageId,
      key: INTEGRATED_SERVICE_PROJECT_ACCOUNTS_KEY,
      value: credentials,
    },
  });
}

// Reserved for future starter completeness checks.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function hasIntegratedServiceDomainScenario(pageId: string) {
  const [
    appCollectionCounts,
    billingAccounts,
    billingPlans,
    billingSubscriptions,
    billingInvoices,
    policyRules,
    geoPlaces,
    geoRegions,
  ] = await Promise.all([
    Promise.all(
      REQUIRED_DOMAIN_COLLECTION_SLUGS.map((collectionSlug) =>
        prisma.appRecord.count({
          where: {
            page_id: pageId,
            collection_slug: collectionSlug,
          },
        }),
      ),
    ),
    prisma.serviceBillingAccount.count({ where: { page_id: pageId } }),
    prisma.serviceBillingPlan.count({ where: { page_id: pageId } }),
    prisma.serviceBillingSubscription.count({ where: { page_id: pageId } }),
    prisma.serviceBillingInvoice.count({ where: { page_id: pageId } }),
    prisma.servicePolicyRule.count({ where: { page_id: pageId } }),
    prisma.serviceGeoPlace.count({ where: { page_id: pageId } }),
    prisma.serviceGeoRegion.count({ where: { page_id: pageId } }),
  ]);

  return (
    appCollectionCounts.every((count) => count > 0) &&
    billingAccounts > 0 &&
    billingPlans > 0 &&
    billingSubscriptions > 0 &&
    billingInvoices > 0 &&
    policyRules > 0 &&
    geoPlaces > 0 &&
    geoRegions > 0
  );
}

async function hasIntegratedServiceRecordScenario(pageId: string, env: AppEnv = "prod") {
  const counts = await Promise.all(
    SCENARIO_RECORD_COLLECTION_SLUGS.map((collectionSlug) =>
      prisma.appRecord.count({
        where: {
          page_id: pageId,
          collection_slug: toEnvSlug(collectionSlug, env),
        },
      }),
    ),
  );
  return SCENARIO_RECORD_COLLECTION_SLUGS.every((collectionSlug, index) => {
    const count = counts[index] ?? 0;
    if (collectionSlug === "documents") return count > 1;
    return count > 0;
  });
}

async function hasIntegratedServicePlatformState(pageId: string) {
  const [
    billingAccounts,
    billingPlans,
    billingSubscriptions,
    billingInvoices,
    policyRules,
    geoPlaces,
    geoRegions,
  ] = await Promise.all([
    prisma.serviceBillingAccount.count({ where: { page_id: pageId } }),
    prisma.serviceBillingPlan.count({ where: { page_id: pageId } }),
    prisma.serviceBillingSubscription.count({ where: { page_id: pageId } }),
    prisma.serviceBillingInvoice.count({ where: { page_id: pageId } }),
    prisma.servicePolicyRule.count({ where: { page_id: pageId } }),
    prisma.serviceGeoPlace.count({ where: { page_id: pageId } }),
    prisma.serviceGeoRegion.count({ where: { page_id: pageId } }),
  ]);

  return (
    billingAccounts > 0 &&
    billingPlans > 0 &&
    billingSubscriptions > 0 &&
    billingInvoices > 0 &&
    policyRules > 0 &&
    geoPlaces > 0 &&
    geoRegions > 0
  );
}

// Reserved for future direct app-user provisioning paths.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function ensureSeedAppUsers(pageId: string, credentials: IntegratedServiceSeedAccount[]) {
  const normalizedCredentials = normalizeSeedAccounts(pageId, credentials);
  const users = await Promise.all(normalizedCredentials.map((account) => ensureSeedAppUser(pageId, account)));
  return {
    credentials: normalizedCredentials,
    adminUser: users[0]!,
    partnerUser: users[1]!,
    memberUser: users[2]!,
  };
}

async function clearIntegratedServiceRecordScenario(pageId: string, env: AppEnv = "prod") {
  await prisma.appRecord.deleteMany({
    where: {
      page_id: pageId,
      collection_slug: {
        in: SCENARIO_RECORD_COLLECTION_SLUGS.map((slug) => toEnvSlug(slug, env)),
      },
    },
  });
}

async function loadExistingIntegratedServiceProject(ownerId: string) {
  const marker = await prisma.pageSetting.findFirst({
    where: {
      key: INTEGRATED_SERVICE_PROJECT_MARKER_KEY,
      page: {
        owner_id: ownerId,
        is_deleted: false,
      },
    },
    orderBy: { updated_at: "desc" },
    select: {
      page_id: true,
      page: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  if (!marker?.page) return null;

  const settings = await prisma.pageSetting.findMany({
    where: {
      page_id: marker.page.id,
      key: {
        in: [INTEGRATED_SERVICE_PROJECT_ACCOUNTS_KEY],
      },
    },
  });
  const accountSetting = settings.find((entry) => entry.key === INTEGRATED_SERVICE_PROJECT_ACCOUNTS_KEY);
  const credentials = parseStoredAccounts(accountSetting?.value);
  return {
    pageId: marker.page.id,
    credentials,
  };
}

async function ensureSeedAppUser(pageId: string, account: IntegratedServiceSeedAccount) {
  let user = await prisma.appUser.findUnique({
    where: { page_id_email: { page_id: pageId, email: account.email } },
  });

  if (!user) {
    const created = await registerAppUser(pageId, account.email, account.password, account.displayName);
    user = await prisma.appUser.findUnique({
      where: { id: created.user.id },
    });
  }

  if (!user) {
    throw new Error(`integrated_service_user_seed_failed:${account.email}`);
  }

  if (user.role !== account.role) {
    await setAppUserRole(user.id, account.role);
    user = await prisma.appUser.findUnique({
      where: { id: user.id },
    });
  }

  if (!user) {
    throw new Error(`integrated_service_user_reload_failed:${account.email}`);
  }

  return user;
}

async function seedInteractivePageData(pageId: string, ownerUserId: string | null | undefined, ownerAnonId: string | null | undefined) {
  await prisma.chatMessage.createMany({
    data: [
      {
        page_id: pageId,
        sender_user_id: null,
        sender_anon_id: "NULL 운영 관리자",
        content: "이번 주말 스튜디오 예약 수요가 빠르게 차고 있습니다. 알림과 할 일 목록을 먼저 확인해 주세요.",
      },
      {
        page_id: pageId,
        sender_user_id: null,
        sender_anon_id: "파트너 운영자",
        content: "새로 등록한 프로그램 오퍼가 승인 대기 상태입니다. 운영 콘솔에서 검토해 주세요.",
      },
      {
        page_id: pageId,
        sender_user_id: null,
        sender_anon_id: "일반 사용자",
        content: "멤버십 쿠폰이 정상 적용되는지 확인 부탁드립니다. 칸반 보드와 노트 패널을 같이 봐 주세요.",
      },
    ],
  });

  await prisma.todo.createMany({
    data: [
      { page_id: pageId, title: "주말 팝업 예약 마감 확인", done: false, sort_order: 1 },
      { page_id: pageId, title: "파트너 소개 이미지 검수", done: false, sort_order: 2 },
      { page_id: pageId, title: "알림 센터 unread 상태 점검", done: true, sort_order: 3 },
      { page_id: pageId, title: "멤버십 결제/정산 대시보드 확인", done: false, sort_order: 4 },
    ],
  });

  await prisma.note.upsert({
    where: { page_id: pageId },
    update: {
      content: [
        "# NULL 통합 검증 서비스",
        "",
        "- 채팅, 알림, 일정, 할 일, 노트, 칸반, 인증 흐름을 한 프로젝트에서 확인합니다.",
        "- 검증 허브에서 시나리오를 고르고, `인증 · 실시간`, `작업 · 운영` 페이지에서 기능별로 확인합니다.",
        "- 데모 계정은 화면 하단의 `데모 계정` 패널에 고정되어 있습니다.",
      ].join("\n"),
    },
    create: {
      page_id: pageId,
      author_user_id: ownerUserId ?? null,
      author_anon_id: ownerAnonId ?? null,
      content: [
        "# NULL 통합 검증 서비스",
        "",
        "- 채팅, 알림, 일정, 할 일, 노트, 칸반, 인증 흐름을 한 프로젝트에서 확인합니다.",
        "- 검증 허브에서 시나리오를 고르고, `인증 · 실시간`, `작업 · 운영` 페이지에서 기능별로 확인합니다.",
        "- 데모 계정은 화면 하단의 `데모 계정` 패널에 고정되어 있습니다.",
      ].join("\n"),
    },
  });

  await prisma.calendarEvent.createMany({
    data: [
      {
        page_id: pageId,
        title: "금요일 19:00 라이브 클래스 준비",
        start_at: new Date("2026-03-27T10:00:00.000Z"),
        end_at: new Date("2026-03-27T11:30:00.000Z"),
        all_day: false,
        meta: { location: "강남 라이브랩", owner: "파트너 운영자" } as Prisma.InputJsonValue,
      },
      {
        page_id: pageId,
        title: "토요일 11:00 파트너 온보딩 세션",
        start_at: new Date("2026-03-28T02:00:00.000Z"),
        end_at: new Date("2026-03-28T03:00:00.000Z"),
        all_day: false,
        meta: { location: "성수 파트너 스튜디오", owner: "운영 관리자" } as Prisma.InputJsonValue,
      },
      {
        page_id: pageId,
        title: "월요일 종일 운영 리포트 마감",
        start_at: new Date("2026-03-30T00:00:00.000Z"),
        end_at: null,
        all_day: true,
        meta: { category: "ops" } as Prisma.InputJsonValue,
      },
    ],
  });

  const backlogColumn = await prisma.kanbanColumn.create({
    data: { page_id: pageId, title: "대기 중", sort_order: 1 },
  });
  const doingColumn = await prisma.kanbanColumn.create({
    data: { page_id: pageId, title: "진행 중", sort_order: 2 },
  });
  const doneColumn = await prisma.kanbanColumn.create({
    data: { page_id: pageId, title: "완료", sort_order: 3 },
  });

  await prisma.kanbanCard.createMany({
    data: [
      {
        page_id: pageId,
        column_id: backlogColumn.id,
        title: "신규 파트너 소개 페이지 검수",
        body: "업로드한 이미지와 알림 문구의 시각 품질을 확인합니다.",
        sort_order: 1,
      },
      {
        page_id: pageId,
        column_id: backlogColumn.id,
        title: "예약 상태 머신 회귀 확인",
        body: "생성 → 확정 → 완료 흐름을 다시 점검합니다.",
        sort_order: 2,
      },
      {
        page_id: pageId,
        column_id: doingColumn.id,
        title: "주말 팝업 알림 발송 검수",
        body: "알림 센터와 이메일 선호도가 같이 반영되는지 확인합니다.",
        sort_order: 1,
      },
      {
        page_id: pageId,
        column_id: doneColumn.id,
        title: "멤버십 정산 검토",
        body: "이번 달 인보이스 및 정산 레코드 확인 완료",
        sort_order: 1,
      },
    ],
  });

  await prisma.pageNotification.createMany({
    data: [
      {
        page_id: pageId,
        recipient_user_id: ownerUserId ?? null,
        recipient_anon_id: ownerAnonId ?? null,
        type: "chat_mention",
        ref_id: "seed-chat-1",
        title: "새 채팅 메시지",
        body: "운영 콘솔에서 오늘 승인 요청을 확인해 주세요.",
      },
      {
        page_id: pageId,
        recipient_user_id: ownerUserId ?? null,
        recipient_anon_id: ownerAnonId ?? null,
        type: "reservation_update",
        ref_id: "seed-reservation-1",
        title: "예약 상태가 확정되었습니다",
        body: "주말 팝업 오픈 리허설 예약이 확정 상태로 변경되었습니다.",
      },
      {
        page_id: pageId,
        recipient_user_id: ownerUserId ?? null,
        recipient_anon_id: ownerAnonId ?? null,
        type: "system_notice",
        ref_id: "seed-system-1",
        title: "통합 검증 서비스 준비 완료",
        body: "채팅, 일정, 할 일, 노트, 칸반, 알림 데이터가 미리 채워졌습니다.",
      },
    ],
  });
}

async function resetInteractivePageData(pageId: string) {
  await prisma.pageNotification.deleteMany({ where: { page_id: pageId } });
  await prisma.chatMessage.deleteMany({ where: { page_id: pageId } });
  await prisma.todo.deleteMany({ where: { page_id: pageId } });
  await prisma.note.deleteMany({ where: { page_id: pageId } });
  await prisma.calendarEvent.deleteMany({ where: { page_id: pageId } });
  await prisma.kanbanCard.deleteMany({ where: { page_id: pageId } });
  await prisma.kanbanColumn.deleteMany({ where: { page_id: pageId } });
}

async function syncIntegratedServiceProject(pageId: string, credentials: IntegratedServiceSeedAccount[], actor: AppAuditActor) {
  await resetInteractivePageData(pageId);
  await seedInteractivePageData(pageId, actor.userId, actor.anonId);
  const version = await savePageVersion({
    pageId,
    contentJson: buildIntegratedServiceDoc({ credentials }) as unknown as Prisma.JsonValue,
  });
  const deployedAt = new Date();
  const deployHash = computeDeployHash((version.content_json ?? null) as Prisma.JsonValue);
  await prisma.$transaction(async (tx) => {
    await cloneDevToProd(pageId, tx);
    await setProdVersionMeta(
      pageId,
      {
        versionId: version.id,
        deployedAt: deployedAt.toISOString(),
        deployHash,
      },
      tx
    );
    await tx.page.update({
      where: { id: pageId },
      data: {
        deployed_at: deployedAt,
        snapshot_thumbnail: buildIntegratedServiceThumbnailDataUrl(),
      },
    });
  });
}

async function seedIntegratedServiceData(pageId: string, actor: AppAuditActor, credentials: IntegratedServiceSeedAccount[] = buildSeedAccounts(pageId)) {
  const normalizedCredentials = normalizeSeedAccounts(pageId, credentials);
  await bootstrapAllServiceDomainEngines({ pageId, actor });

  const [adminUser, partnerUser, memberUser] = await Promise.all(normalizedCredentials.map((account) => ensureSeedAppUser(pageId, account)));

  const ownerKey = `app_user:${adminUser.id}`;
  const partnerKey = `app_user:${partnerUser.id}`;
  const memberKey = `app_user:${memberUser.id}`;

  const feedPost = await createServiceFeedPost({
    pageId,
    title: "강남 라이브랩 주말 오픈 클래스 공지",
    excerpt: "신규 팝업 클래스 예약과 멤버십 혜택이 이번 주말부터 동시에 열립니다.",
    body: "채팅, 알림, 예약, 멤버십, 운영 콘솔까지 한 프로젝트 안에서 점검할 수 있도록 준비한 통합 검증용 피드입니다.",
    category: "community",
    featured: true,
    score: 92,
    views: 341,
    upvotes: 27,
    tags: ["community", "reservation", "membership"],
    actor,
  });
  await createServiceFeedPost({
    pageId,
    title: "파트너 온보딩 체크리스트가 갱신되었습니다",
    excerpt: "CRM 파이프라인과 일정, 티켓 대응 문맥이 하나의 프로젝트로 연결됩니다.",
    body: "운영 콘솔과 파트너 포털이 같은 프로젝트 안에서 연결되는지 확인하기 위한 두 번째 피드 항목입니다.",
    category: "ops",
    score: 71,
    views: 212,
    upvotes: 15,
    tags: ["ops", "crm", "ticket"],
    actor,
  });

  const thread = await createServiceCommentThread({
    pageId,
    key: "feed:weekend-pop-up",
    title: "주말 팝업 운영 메모",
    entityType: "feed_post",
    entityId: feedPost.id,
    actor,
  });
  const comment = await createServiceComment({
    pageId,
    threadId: thread.id,
    body: "예약 현황을 빠르게 찾고 있으니 실시간 알림과 노트 패널을 같이 확인해 주세요.",
    authorKey: partnerKey,
    actor,
  });
  await createServiceComment({
    pageId,
    threadId: thread.id,
    body: "멤버십 고객은 현장 결제 없이 바로 체크인됩니다.",
    authorKey: ownerKey,
    parentCommentId: comment.id,
    actor,
  });
  await toggleServiceReaction({
    pageId,
    threadId: thread.id,
    subjectType: "comment",
    subjectId: comment.id,
    emoji: "👍",
    actorKey: memberKey,
    actor,
  });

  const resource = await createReservationResource({
    pageId,
    key: "studio-room-a",
    name: "강남 라이브랩 룸 A",
    capacity: 12,
    actor,
  });
  const upcomingReservation = await createReservation({
    pageId,
    resourceId: resource.id,
    title: "주말 팝업 리허설",
    customerKey: memberKey,
    startsAt: "2026-03-27T11:00:00.000Z",
    endsAt: "2026-03-27T12:00:00.000Z",
    notes: "실제 서비스용 예약/상태 머신 검증 데이터",
    actor,
  });
  await transitionReservation({
    pageId,
    reservationId: upcomingReservation.id,
    eventType: "reservation.confirm",
    actor,
  });
  const completedReservation = await createReservation({
    pageId,
    resourceId: resource.id,
    title: "파트너 운영 상담 세션",
    customerKey: partnerKey,
    startsAt: "2026-03-20T09:00:00.000Z",
    endsAt: "2026-03-20T10:00:00.000Z",
    notes: "완료 상태 전이를 확인하기 위한 시드 데이터",
    actor,
  });
  await transitionReservation({
    pageId,
    reservationId: completedReservation.id,
    eventType: "reservation.confirm",
    actor,
  });
  await transitionReservation({
    pageId,
    reservationId: completedReservation.id,
    eventType: "reservation.complete",
    actor,
  });

  const queue = await createTicketQueue({
    pageId,
    key: "partner-support",
    name: "파트너 지원",
    slaHours: 6,
    defaultAssignee: ownerKey,
    actor,
  });
  const ticket = await createTicket({
    pageId,
    queueId: queue.id,
    title: "정산 계좌 확인 요청",
    requesterKey: partnerKey,
    body: "이번 주 정산이 정상 처리되었는지 운영 콘솔에서 확인해 주세요.",
    assigneeKey: ownerKey,
    priority: "high",
    actor,
  });
  await addTicketMessage({
    pageId,
    ticketId: ticket.id,
    authorKey: ownerKey,
    body: "확인 중입니다. 인보이스와 정산 이력을 다시 점검하고 회신드리겠습니다.",
    visibility: "public",
    actor,
  });

  const document = await createApprovalDocument({
    pageId,
    key: "ops-policy-v1",
    title: "운영 정책 개정안",
    body: "신규 파트너 승인 요건과 신고 제재 기준을 업데이트합니다.",
    approverKey: ownerKey,
    actor,
  });
  const approval = await submitApprovalDocument({
    pageId,
    documentId: document.id,
    subjectKey: "policy:ops",
    subjectLabel: "운영 정책",
    actor,
  });
  await decideApprovalDocument({
    pageId,
    documentId: document.id,
    requestId: approval.approvalRequest.id,
    status: "approved",
    actor,
  });

  const pendingDocument = await createApprovalDocument({
    pageId,
    key: "partner-refund-review-v1",
    title: "환불 기준 변경 승인",
    body: "파트너 환불 예외 기준을 조정하는 새 문서입니다. 검토 후 승인 또는 반려가 필요합니다.",
    approverKey: ownerKey,
    actor,
  });
  await submitApprovalDocument({
    pageId,
    documentId: pendingDocument.id,
    subjectKey: "policy:refunds",
    subjectLabel: "환불 정책",
    actor,
  });

  const tier = await upsertMembershipTier({
    pageId,
    key: "plus",
    name: "로컬 플러스",
    description: "예약 우선권과 전용 고객지원을 포함한 구독 플랜",
    priceCents: 9900,
    currency: "KRW",
    actor,
  });
  const membership = await startMembershipPlanSubscription({
    pageId,
    tierId: tier.id,
    subjectKey: memberKey,
    email: memberUser.email,
    customerName: memberUser.display_name ?? memberUser.email,
    actor,
  });
  await createServiceBillingCharge({
    pageId,
    accountId: membership.account.id,
    description: "프리미엄 예약 우선권",
    quantity: 1,
    unitAmountCents: 2900,
    currency: "KRW",
    kind: "addon",
    metadata: { source: "integrated_service_seed" },
  });
  const invoice = await generateServiceBillingInvoice({
    pageId,
    accountId: membership.account.id,
    metadata: { source: "integrated_service_seed" },
  });
  if (!invoice) {
    throw new Error("integrated_service_invoice_seed_failed");
  }
  await markServiceBillingInvoicePaid({
    pageId,
    invoiceId: invoice.id,
    externalRef: "seed-paid",
    metadata: { source: "integrated_service_seed" },
  });
  await runServiceBillingSettlement({
    pageId,
    invoiceId: invoice.id,
    metadata: { source: "integrated_service_seed" },
  });

  const crm = await createCrmPipeline({
    pageId,
    key: "partner-onboarding",
    name: "파트너 온보딩",
    actor,
  });
  const qualifiedStage = crm.stages.find((stage) => String((stage.data as Record<string, unknown>).key ?? "") === "qualified") ?? crm.stages[1] ?? crm.stages[0];
  const lead = await createCrmLead({
    pageId,
    pipelineId: crm.pipeline.id,
    stageId: crm.stages[0]!.id,
    name: "성수 팝업 스튜디오",
    company: "Seongsu Studio",
    email: "contact@seongsu-studio.example",
    value: 1800000,
    ownerKey: ownerKey,
    notes: "온보딩 완료 후 예약 리소스와 알림 정책을 연결할 예정입니다.",
    actor,
  });
  if (qualifiedStage) {
    await moveCrmLead({
      pageId,
      leadId: lead.id,
      stageId: qualifiedStage.id,
      status: "qualified",
      actor,
    });
  }

  await upsertServiceGeoPlace({
    pageId,
    key: "gangnam-hub",
    label: "강남 라이브랩",
    query: "강남역",
    address: "서울 강남구 테헤란로 123",
    lat: 37.4981,
    lng: 127.0276,
    provider: "local",
    metadata: { category: "hub" },
  });
  await upsertServiceGeoPlace({
    pageId,
    key: "seongsu-partner",
    label: "성수 파트너 스튜디오",
    query: "성수동",
    address: "서울 성동구 성수이로 77",
    lat: 37.5446,
    lng: 127.0557,
    provider: "local",
    metadata: { category: "partner" },
  });
  await upsertServiceGeoRegion({
    pageId,
    key: "gangnam-primary",
    name: "강남 주 운영권역",
    center: { lat: 37.4981, lng: 127.0276 },
    radiusM: 3200,
    active: true,
    policy: { serviceable: true, etaMinutes: 18 },
    metadata: { source: "integrated_service_seed" },
  });

  await upsertServiceNotificationPreference({
    pageId,
    recipientKey: appUserRecipientKey(adminUser.id),
    channel: "in_app",
    enabled: true,
    actor,
  });
  await upsertServiceNotificationPreference({
    pageId,
    recipientKey: appUserRecipientKey(partnerUser.id),
    channel: "in_app",
    enabled: true,
    actor,
  });
  await upsertServiceNotificationPreference({
    pageId,
    recipientKey: appUserRecipientKey(partnerUser.id),
    channel: "email",
    enabled: true,
    actor,
  });
  await queueServiceNotifications({
    pageId,
    recipients: [
      {
        recipientKey: appUserRecipientKey(adminUser.id),
        recipientLabel: adminUser.display_name ?? adminUser.email,
        appUserId: adminUser.id,
      },
      {
        recipientKey: appUserRecipientKey(partnerUser.id),
        recipientLabel: partnerUser.display_name ?? partnerUser.email,
        appUserId: partnerUser.id,
      },
    ],
    type: "integrated_service.ready",
    topic: "project.bootstrap",
    title: "통합 검증 서비스가 준비되었습니다",
    body: "대시보드와 운영 콘솔에서 바로 전체 흐름을 확인할 수 있습니다.",
    channels: ["in_app", "email"],
    payload: {
      feedPostId: feedPost.id,
      reservationId: upcomingReservation.id,
      ticketId: ticket.id,
      crmLeadId: lead.id,
    },
    autoDispatch: true,
    actor,
  });
  await dispatchQueuedServiceNotifications({ pageId, limit: 20 });

  return normalizedCredentials;
}

export async function ensureIntegratedServiceScenarioState(
  pageId: string,
  actor: AppAuditActor,
  credentials: IntegratedServiceSeedAccount[] = buildSeedAccounts(pageId),
) {
  const normalizedCredentials = normalizeSeedAccounts(pageId, credentials);
  await persistIntegratedServiceAccounts(pageId, normalizedCredentials);
  const [hasRecordScenario, hasPlatformState] = await Promise.all([
    hasIntegratedServiceRecordScenario(pageId, "prod"),
    hasIntegratedServicePlatformState(pageId),
  ]);
  if (!hasRecordScenario) {
    await clearIntegratedServiceRecordScenario(pageId, "prod");
  }
  if (!hasRecordScenario || !hasPlatformState) {
    await seedIntegratedServiceData(pageId, actor, normalizedCredentials);
  }
  return normalizedCredentials;
}

export async function ensureIntegratedServiceProject(input: {
  ownerId: string;
  userId?: string | null;
  anonId?: string | null;
}): Promise<EnsureIntegratedServiceProjectResult> {
  const actor: AppAuditActor = {
    userId: input.userId ?? null,
    anonId: input.anonId ?? null,
  };
  const existing = await loadExistingIntegratedServiceProject(input.ownerId);
  if (existing) {
    const credentials = normalizeSeedAccounts(existing.pageId, existing.credentials);
    await syncIntegratedServiceProject(existing.pageId, credentials, actor);
    await ensureIntegratedServiceScenarioState(existing.pageId, actor, credentials);
    return toRouteResult(existing.pageId, false, credentials);
  }

  const { page } = await createDraftPage({
    ownerId: input.ownerId,
    title: INTEGRATED_SERVICE_PROJECT_TITLE,
    contentJson: buildIntegratedServiceDoc() as unknown as Prisma.JsonValue,
  });

  await prisma.page.update({
    where: { id: page.id },
    data: {
      snapshot_thumbnail: buildIntegratedServiceThumbnailDataUrl(),
    },
  });

  const credentials = buildSeedAccounts(page.id);

  await syncIntegratedServiceProject(page.id, credentials, actor);
  await ensureIntegratedServiceScenarioState(page.id, actor, credentials);

  await prisma.pageSetting.upsert({
    where: {
      page_id_key: {
        page_id: page.id,
        key: INTEGRATED_SERVICE_PROJECT_MARKER_KEY,
      },
    },
    update: {
      value: {
        starter: "integrated_service",
        title: INTEGRATED_SERVICE_PROJECT_TITLE,
      },
    },
    create: {
      page_id: page.id,
      key: INTEGRATED_SERVICE_PROJECT_MARKER_KEY,
      value: {
        starter: "integrated_service",
        title: INTEGRATED_SERVICE_PROJECT_TITLE,
      },
    },
  });

  await prisma.pageSetting.upsert({
    where: {
      page_id_key: {
        page_id: page.id,
        key: INTEGRATED_SERVICE_PROJECT_META_KEY,
      },
    },
    update: {
      value: {
        sections: ["customer_app", "partner_portal", "ops_console"],
        createdAt: new Date().toISOString(),
      },
    },
    create: {
      page_id: page.id,
      key: INTEGRATED_SERVICE_PROJECT_META_KEY,
      value: {
        sections: ["customer_app", "partner_portal", "ops_console"],
        createdAt: new Date().toISOString(),
      },
    },
  });

  return toRouteResult(page.id, true, credentials);
}
