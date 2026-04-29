import { prisma } from "@/lib/db";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { resolveScalingConfig } from "@/lib/scaling";

const SERVICE_OPS_KEY = "service_ops";
const HOSTING_KEY = "hosting";
const MAX_RELEASE_HISTORY = 50;
const MAX_BACKUP_HISTORY = 50;

export type ServiceOpsEnvironmentKey = "dev" | "staging" | "prod";

export type ServiceOpsEnvironment = {
  key: ServiceOpsEnvironmentKey;
  label: string;
  url: string | null;
  protected: boolean;
  releaseChannel: "manual" | "candidate" | "stable";
};

export type ServiceOpsReleaseRecord = {
  id: string;
  environmentKey: ServiceOpsEnvironmentKey;
  versionId: string | null;
  deployHash: string | null;
  deployUrl: string | null;
  deployed: boolean;
  note: string | null;
  createdAt: string;
};

export type ServiceOpsBackupRecord = {
  id: string;
  kind: "export" | "restore";
  backupVersion: number;
  counts: Record<string, number>;
  note: string | null;
  createdAt: string;
};

export type ServiceOpsReleasePolicy = {
  requireApproval: boolean;
  stableEnvironment: ServiceOpsEnvironmentKey;
  previewEnvironment: ServiceOpsEnvironmentKey;
  allowDirectProdDeploy: boolean;
};

export type ServiceOpsRecoveryPolicy = {
  backupBeforeDeploy: boolean;
  retainBackups: number;
  restoreRequiresApproval: boolean;
};

export type ServiceOpsMigrationPolicy = {
  strategy: "expand-contract" | "direct";
  requireBackup: boolean;
  requireStagingValidation: boolean;
  allowAutoRollback: boolean;
};

export type ServiceOpsIncidentPolicy = {
  enabled: boolean;
  queueBacklogThreshold: number;
  latencyThresholdMs: number;
  backupFailureThreshold: number;
  channels: string[];
};

export type ServiceOpsRollbackPlan = {
  environmentKey: ServiceOpsEnvironmentKey;
  currentVersionId: string | null;
  targetVersionId: string | null;
  targetReleaseId: string | null;
  createdAt: string;
  steps: string[];
};

export type ServiceOpsProfile = {
  environments: ServiceOpsEnvironment[];
  releasePolicy: ServiceOpsReleasePolicy;
  recoveryPolicy: ServiceOpsRecoveryPolicy;
  migrationPolicy: ServiceOpsMigrationPolicy;
  incidentPolicy: ServiceOpsIncidentPolicy;
  runbookNotes: string[];
  releases: ServiceOpsReleaseRecord[];
  backups: ServiceOpsBackupRecord[];
  lastRollbackPlan: ServiceOpsRollbackPlan | null;
  updatedAt: string | null;
};

export type ServiceOpsOverview = {
  generatedAt: string;
  deployment: {
    currentVersionId: string | null;
    deployedAt: string | null;
    prodUrl: string | null;
    environments: ServiceOpsEnvironment[];
  };
  capacity: {
    queueBackend: "memory" | "redis";
    cacheStore: "memory" | "redis";
    sessionStore: "cookie" | "redis";
    workerConcurrency: number;
    minInstances: number;
    maxInstances: number;
  };
  metrics: {
    releases30d: number;
    backups30d: number;
    appCollections: number;
    appRecords: number;
    events24h: number;
    mediaAssets: number;
    mediaBytes: number;
    queuedJobs: number;
    deadLetteredJobs: number;
    pageAudit24h: number;
    appAudit24h: number;
  };
};

export type ServiceOpsRunbook = {
  generatedAt: string;
  sections: {
    release: string[];
    rollback: string[];
    backup: string[];
    migration: string[];
    incidents: string[];
  };
};

export type ServiceOpsProfilePatch = {
  environments?: Array<Partial<ServiceOpsEnvironment> & { key?: string }>;
  releasePolicy?: Partial<ServiceOpsReleasePolicy>;
  recoveryPolicy?: Partial<ServiceOpsRecoveryPolicy>;
  migrationPolicy?: Partial<ServiceOpsMigrationPolicy>;
  incidentPolicy?: Partial<ServiceOpsIncidentPolicy>;
  runbookNotes?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function buildBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
}

function buildDevUrl(pageId: string) {
  const base = buildBaseUrl();
  const path = `/editor/advanced?pageId=${encodeURIComponent(pageId)}&env=dev`;
  return base ? `${base}${path}` : path;
}

function buildProdUrl(pageId: string, customDomain?: string | null) {
  const normalized = typeof customDomain === "string" && customDomain.trim() ? customDomain.trim() : null;
  if (normalized) return `https://${normalized}`;
  const base = buildBaseUrl();
  const path = `/p/${pageId}`;
  return base ? `${base}${path}` : path;
}

function defaultEnvironments(pageId: string, prodUrl: string | null): ServiceOpsEnvironment[] {
  return [
    {
      key: "dev",
      label: "Development",
      url: buildDevUrl(pageId),
      protected: false,
      releaseChannel: "manual",
    },
    {
      key: "staging",
      label: "Staging",
      url: null,
      protected: true,
      releaseChannel: "candidate",
    },
    {
      key: "prod",
      label: "Production",
      url: prodUrl,
      protected: true,
      releaseChannel: "stable",
    },
  ];
}

function defaultProfile(pageId: string, prodUrl: string | null): ServiceOpsProfile {
  return {
    environments: defaultEnvironments(pageId, prodUrl),
    releasePolicy: {
      requireApproval: true,
      stableEnvironment: "prod",
      previewEnvironment: "staging",
      allowDirectProdDeploy: false,
    },
    recoveryPolicy: {
      backupBeforeDeploy: true,
      retainBackups: 20,
      restoreRequiresApproval: true,
    },
    migrationPolicy: {
      strategy: "expand-contract",
      requireBackup: true,
      requireStagingValidation: true,
      allowAutoRollback: true,
    },
    incidentPolicy: {
      enabled: true,
      queueBacklogThreshold: 50,
      latencyThresholdMs: 1000,
      backupFailureThreshold: 1,
      channels: [],
    },
    runbookNotes: [],
    releases: [],
    backups: [],
    lastRollbackPlan: null,
    updatedAt: null,
  };
}

function normalizeEnvironmentArray(pageId: string, prodUrl: string | null, value: unknown) {
  const defaults = defaultEnvironments(pageId, prodUrl);
  const input = Array.isArray(value) ? value : [];
  const mapped = new Map<ServiceOpsEnvironmentKey, ServiceOpsEnvironment>();

  for (const item of input) {
    if (!isRecord(item)) continue;
    const key = asString(item.key) as ServiceOpsEnvironmentKey | undefined;
    if (!key || !["dev", "staging", "prod"].includes(key)) continue;
    mapped.set(key, {
      key,
      label: asString(item.label) ?? defaults.find((entry) => entry.key === key)!.label,
      url: asString(item.url) ?? null,
      protected: asBoolean(item.protected, key !== "dev"),
      releaseChannel:
        asString(item.releaseChannel) === "stable" || asString(item.releaseChannel) === "candidate"
          ? (asString(item.releaseChannel) as "stable" | "candidate")
          : "manual",
    });
  }

  return defaults.map((entry) => {
    const candidate = mapped.get(entry.key);
    if (!candidate) return entry;
    if (entry.key === "dev") {
      return { ...candidate, url: candidate.url ?? buildDevUrl(pageId), protected: false };
    }
    if (entry.key === "prod") {
      return { ...candidate, url: candidate.url ?? prodUrl };
    }
    return candidate;
  });
}

function normalizeReleasePolicy(value: unknown, fallback: ServiceOpsReleasePolicy): ServiceOpsReleasePolicy {
  if (!isRecord(value)) return fallback;
  const stableEnvironment = asString(value.stableEnvironment);
  const previewEnvironment = asString(value.previewEnvironment);
  return {
    requireApproval: asBoolean(value.requireApproval, fallback.requireApproval),
    stableEnvironment: stableEnvironment === "dev" || stableEnvironment === "staging" ? (stableEnvironment as ServiceOpsEnvironmentKey) : "prod",
    previewEnvironment: previewEnvironment === "dev" || previewEnvironment === "prod" ? (previewEnvironment as ServiceOpsEnvironmentKey) : "staging",
    allowDirectProdDeploy: asBoolean(value.allowDirectProdDeploy, fallback.allowDirectProdDeploy),
  };
}

function normalizeRecoveryPolicy(value: unknown, fallback: ServiceOpsRecoveryPolicy): ServiceOpsRecoveryPolicy {
  if (!isRecord(value)) return fallback;
  return {
    backupBeforeDeploy: asBoolean(value.backupBeforeDeploy, fallback.backupBeforeDeploy),
    retainBackups: asNumber(value.retainBackups, fallback.retainBackups, 1, 200),
    restoreRequiresApproval: asBoolean(value.restoreRequiresApproval, fallback.restoreRequiresApproval),
  };
}

function normalizeMigrationPolicy(value: unknown, fallback: ServiceOpsMigrationPolicy): ServiceOpsMigrationPolicy {
  if (!isRecord(value)) return fallback;
  return {
    strategy: asString(value.strategy) === "direct" ? "direct" : "expand-contract",
    requireBackup: asBoolean(value.requireBackup, fallback.requireBackup),
    requireStagingValidation: asBoolean(value.requireStagingValidation, fallback.requireStagingValidation),
    allowAutoRollback: asBoolean(value.allowAutoRollback, fallback.allowAutoRollback),
  };
}

function normalizeIncidentPolicy(value: unknown, fallback: ServiceOpsIncidentPolicy): ServiceOpsIncidentPolicy {
  if (!isRecord(value)) return fallback;
  return {
    enabled: asBoolean(value.enabled, fallback.enabled),
    queueBacklogThreshold: asNumber(value.queueBacklogThreshold, fallback.queueBacklogThreshold, 1, 100000),
    latencyThresholdMs: asNumber(value.latencyThresholdMs, fallback.latencyThresholdMs, 50, 60000),
    backupFailureThreshold: asNumber(value.backupFailureThreshold, fallback.backupFailureThreshold, 1, 50),
    channels: asStringArray(value.channels),
  };
}

function normalizeReleaseRecord(value: unknown): ServiceOpsReleaseRecord | null {
  if (!isRecord(value)) return null;
  const environmentKey = asString(value.environmentKey);
  if (environmentKey !== "dev" && environmentKey !== "staging" && environmentKey !== "prod") return null;
  return {
    id: asString(value.id) ?? `release_${Date.now()}`,
    environmentKey,
    versionId: asString(value.versionId) ?? null,
    deployHash: asString(value.deployHash) ?? null,
    deployUrl: asString(value.deployUrl) ?? null,
    deployed: asBoolean(value.deployed, true),
    note: asString(value.note) ?? null,
    createdAt: asString(value.createdAt) ?? new Date().toISOString(),
  };
}

function normalizeBackupRecord(value: unknown): ServiceOpsBackupRecord | null {
  if (!isRecord(value)) return null;
  const kind = asString(value.kind);
  if (kind !== "export" && kind !== "restore") return null;
  const countsSource = isRecord(value.counts) ? value.counts : {};
  const counts: Record<string, number> = {};
  for (const [key, item] of Object.entries(countsSource)) {
    counts[key] = asNumber(item, 0, 0, 1_000_000);
  }
  return {
    id: asString(value.id) ?? `backup_${Date.now()}`,
    kind,
    backupVersion: asNumber(value.backupVersion, 1, 1, 1000),
    counts,
    note: asString(value.note) ?? null,
    createdAt: asString(value.createdAt) ?? new Date().toISOString(),
  };
}

function normalizeRollbackPlan(value: unknown): ServiceOpsRollbackPlan | null {
  if (!isRecord(value)) return null;
  const environmentKey = asString(value.environmentKey);
  if (environmentKey !== "dev" && environmentKey !== "staging" && environmentKey !== "prod") return null;
  return {
    environmentKey,
    currentVersionId: asString(value.currentVersionId) ?? null,
    targetVersionId: asString(value.targetVersionId) ?? null,
    targetReleaseId: asString(value.targetReleaseId) ?? null,
    createdAt: asString(value.createdAt) ?? new Date().toISOString(),
    steps: asStringArray(value.steps),
  };
}

async function resolveProdUrl(pageId: string) {
  const hosting = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: HOSTING_KEY } },
    select: { value: true },
  });
  const customDomain =
    hosting?.value && typeof hosting.value === "object" && !Array.isArray(hosting.value)
      ? asString((hosting.value as Record<string, unknown>).customDomain)
      : null;
  return buildProdUrl(pageId, customDomain);
}

function serializeProfile(profile: ServiceOpsProfile) {
  return {
    environments: profile.environments,
    releasePolicy: profile.releasePolicy,
    recoveryPolicy: profile.recoveryPolicy,
    migrationPolicy: profile.migrationPolicy,
    incidentPolicy: profile.incidentPolicy,
    runbookNotes: profile.runbookNotes,
    releases: profile.releases,
    backups: profile.backups,
    lastRollbackPlan: profile.lastRollbackPlan,
    updatedAt: profile.updatedAt,
  };
}

function mergeProfile(pageId: string, prodUrl: string | null, stored: unknown, patch?: ServiceOpsProfilePatch): ServiceOpsProfile {
  const defaults = defaultProfile(pageId, prodUrl);
  const source = isRecord(stored) ? stored : {};
  const merged = {
    ...source,
    ...(patch ?? {}),
  };
  return {
    environments: normalizeEnvironmentArray(pageId, prodUrl, merged.environments ?? source.environments),
    releasePolicy: normalizeReleasePolicy(merged.releasePolicy ?? source.releasePolicy, defaults.releasePolicy),
    recoveryPolicy: normalizeRecoveryPolicy(merged.recoveryPolicy ?? source.recoveryPolicy, defaults.recoveryPolicy),
    migrationPolicy: normalizeMigrationPolicy(merged.migrationPolicy ?? source.migrationPolicy, defaults.migrationPolicy),
    incidentPolicy: normalizeIncidentPolicy(merged.incidentPolicy ?? source.incidentPolicy, defaults.incidentPolicy),
    runbookNotes: asStringArray(merged.runbookNotes ?? source.runbookNotes),
    releases: (Array.isArray(source.releases) ? source.releases : [])
      .map((item) => normalizeReleaseRecord(item))
      .filter((item): item is ServiceOpsReleaseRecord => Boolean(item))
      .slice(-MAX_RELEASE_HISTORY),
    backups: (Array.isArray(source.backups) ? source.backups : [])
      .map((item) => normalizeBackupRecord(item))
      .filter((item): item is ServiceOpsBackupRecord => Boolean(item))
      .slice(-MAX_BACKUP_HISTORY),
    lastRollbackPlan: normalizeRollbackPlan(source.lastRollbackPlan),
    updatedAt: asString(source.updatedAt) ?? null,
  };
}

async function readStoredProfile(pageId: string) {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: SERVICE_OPS_KEY } },
    select: { value: true },
  });
  return row?.value ?? null;
}

export async function getServiceOperationsProfile(pageId: string) {
  const [stored, prodUrl] = await Promise.all([readStoredProfile(pageId), resolveProdUrl(pageId)]);
  return mergeProfile(pageId, prodUrl, stored);
}

export async function upsertServiceOperationsProfile(input: {
  pageId: string;
  patch?: ServiceOpsProfilePatch;
  actor?: AppAuditActor;
}) {
  const prodUrl = await resolveProdUrl(input.pageId);
  const stored = await readStoredProfile(input.pageId);
  const nextProfile = mergeProfile(input.pageId, prodUrl, stored, input.patch);
  nextProfile.updatedAt = new Date().toISOString();

  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: input.pageId, key: SERVICE_OPS_KEY } },
    update: { value: serializeProfile(nextProfile) as object },
    create: { page_id: input.pageId, key: SERVICE_OPS_KEY, value: serializeProfile(nextProfile) as object },
  });

  await logAppAudit({
    pageId: input.pageId,
    action: "service_ops_profile_update",
    targetType: "service_ops",
    targetId: input.pageId,
    meta: {
      environments: nextProfile.environments.map((item) => item.key),
      release_policy: nextProfile.releasePolicy,
      recovery_policy: nextProfile.recoveryPolicy,
      migration_policy: nextProfile.migrationPolicy,
      incident_policy: nextProfile.incidentPolicy,
    },
    actor: input.actor,
  });

  return nextProfile;
}

export async function recordServiceReleaseSnapshot(input: {
  pageId: string;
  environmentKey?: ServiceOpsEnvironmentKey;
  versionId?: string | null;
  deployHash?: string | null;
  deployUrl?: string | null;
  deployed?: boolean;
  note?: string | null;
  actor?: AppAuditActor;
}) {
  const profile = await getServiceOperationsProfile(input.pageId);
  const record: ServiceOpsReleaseRecord = {
    id: `release_${Date.now()}`,
    environmentKey: input.environmentKey ?? "prod",
    versionId: input.versionId ?? null,
    deployHash: input.deployHash ?? null,
    deployUrl: input.deployUrl ?? null,
    deployed: input.deployed ?? true,
    note: input.note ?? null,
    createdAt: new Date().toISOString(),
  };
  const environments = profile.environments.map((item) =>
    item.key === record.environmentKey
      ? { ...item, url: record.deployUrl ?? item.url }
      : item,
  );
  const nextProfile = await upsertServiceOperationsProfile({
    pageId: input.pageId,
    patch: {
      environments,
      runbookNotes: profile.runbookNotes,
    },
    actor: input.actor,
  });
  const releases = [...nextProfile.releases, record].slice(-MAX_RELEASE_HISTORY);
  nextProfile.releases = releases;
  nextProfile.updatedAt = new Date().toISOString();

  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: input.pageId, key: SERVICE_OPS_KEY } },
    update: { value: serializeProfile(nextProfile) as object },
    create: { page_id: input.pageId, key: SERVICE_OPS_KEY, value: serializeProfile(nextProfile) as object },
  });

  await logAppAudit({
    pageId: input.pageId,
    action: "service_ops_release_record",
    targetType: "service_release",
    targetId: record.id,
    meta: record as unknown as Record<string, unknown>,
    actor: input.actor,
  });

  return { profile: nextProfile, release: record };
}

export async function recordServiceBackupSnapshot(input: {
  pageId: string;
  kind: "export" | "restore";
  backupVersion?: number;
  counts?: Record<string, number>;
  note?: string | null;
  actor?: AppAuditActor;
}) {
  const profile = await getServiceOperationsProfile(input.pageId);
  const backup: ServiceOpsBackupRecord = {
    id: `backup_${Date.now()}`,
    kind: input.kind,
    backupVersion: input.backupVersion ?? 1,
    counts: input.counts ?? {},
    note: input.note ?? null,
    createdAt: new Date().toISOString(),
  };
  const backups = [...profile.backups, backup].slice(-MAX_BACKUP_HISTORY);
  const nextProfile = {
    ...profile,
    backups,
    updatedAt: new Date().toISOString(),
  };
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: input.pageId, key: SERVICE_OPS_KEY } },
    update: { value: serializeProfile(nextProfile) as object },
    create: { page_id: input.pageId, key: SERVICE_OPS_KEY, value: serializeProfile(nextProfile) as object },
  });

  await logAppAudit({
    pageId: input.pageId,
    action: "service_ops_backup_record",
    targetType: "service_backup",
    targetId: backup.id,
    meta: backup as unknown as Record<string, unknown>,
    actor: input.actor,
  });

  return { profile: nextProfile, backup };
}

export async function planServiceRollback(input: {
  pageId: string;
  environmentKey?: ServiceOpsEnvironmentKey;
  currentVersionId?: string | null;
  targetReleaseId?: string | null;
  targetVersionId?: string | null;
  actor?: AppAuditActor;
}) {
  const environmentKey = input.environmentKey ?? "prod";
  const profile = await getServiceOperationsProfile(input.pageId);
  const page = await prisma.page.findUnique({
    where: { id: input.pageId },
    select: { current_version_id: true },
  });
  const currentVersionId = input.currentVersionId ?? page?.current_version_id ?? null;
  const candidates = profile.releases
    .filter((item) => item.environmentKey === environmentKey && item.deployed)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  let target: ServiceOpsReleaseRecord | null = input.targetReleaseId
    ? candidates.find((item) => item.id === input.targetReleaseId) ?? null
    : null;
  if (!target && input.targetVersionId) {
    target = candidates.find((item) => item.versionId === input.targetVersionId) ?? null;
  }
  if (!target) {
    target = candidates.find((item) => item.versionId && item.versionId !== currentVersionId) ?? null;
  }

  const plan: ServiceOpsRollbackPlan = {
    environmentKey,
    currentVersionId,
    targetVersionId: target?.versionId ?? null,
    targetReleaseId: target?.id ?? null,
    createdAt: new Date().toISOString(),
    steps: [
      `현재 환경(${environmentKey})의 배포 버전을 확인합니다.`,
      `대상 버전(${target?.versionId ?? "미선정"})을 선택합니다.`,
      `복구 전 최신 백업 스냅샷을 확보합니다.`,
      `버전 복구 또는 재배포를 실행합니다.`,
      `헬스체크와 핵심 흐름 회귀를 다시 확인합니다.`,
    ],
  };
  const nextProfile = { ...profile, lastRollbackPlan: plan, updatedAt: new Date().toISOString() };
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: input.pageId, key: SERVICE_OPS_KEY } },
    update: { value: serializeProfile(nextProfile) as object },
    create: { page_id: input.pageId, key: SERVICE_OPS_KEY, value: serializeProfile(nextProfile) as object },
  });
  await logAppAudit({
    pageId: input.pageId,
    action: "service_ops_rollback_plan",
    targetType: "service_release",
    targetId: plan.targetReleaseId,
    meta: plan as unknown as Record<string, unknown>,
    actor: input.actor,
  });
  return plan;
}

export async function buildServiceOperationsOverview(pageId: string): Promise<ServiceOpsOverview> {
  const [profile, page, appCollections, appRecords, events24h, mediaAssets, mediaBytes, queuedJobs, deadLetteredJobs, pageAudit24h, appAudit24h] =
    await Promise.all([
      getServiceOperationsProfile(pageId),
      prisma.page.findUnique({
        where: { id: pageId },
        select: { current_version_id: true, deployed_at: true },
      }),
      prisma.appCollection.count({ where: { page_id: pageId } }),
      prisma.appRecord.count({ where: { page_id: pageId } }),
      prisma.event.count({ where: { page_id: pageId, ts: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      prisma.serviceMediaAsset.count({ where: { page_id: pageId } }),
      prisma.serviceMediaAsset.aggregate({ where: { page_id: pageId }, _sum: { size_bytes: true } }),
      prisma.backgroundJob.count({ where: { page_id: pageId, status: { in: ["queued", "running"] } } }),
      prisma.backgroundJobDeadLetter.count({ where: { page_id: pageId } }),
      prisma.pageAuditLog.count({ where: { page_id: pageId, created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      prisma.appAuditLog.count({ where: { page_id: pageId, created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);

  const scaling = resolveScalingConfig();
  const since30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const releases30d = profile.releases.filter((item) => Date.parse(item.createdAt) >= since30d).length;
  const backups30d = profile.backups.filter((item) => Date.parse(item.createdAt) >= since30d).length;

  return {
    generatedAt: new Date().toISOString(),
    deployment: {
      currentVersionId: page?.current_version_id ?? null,
      deployedAt: page?.deployed_at?.toISOString() ?? null,
      prodUrl: profile.environments.find((item) => item.key === "prod")?.url ?? null,
      environments: profile.environments,
    },
    capacity: {
      queueBackend: scaling.queueBackend,
      cacheStore: scaling.cacheStore,
      sessionStore: scaling.sessionStore,
      workerConcurrency: scaling.workerConcurrency,
      minInstances: scaling.minInstances,
      maxInstances: scaling.maxInstances,
    },
    metrics: {
      releases30d,
      backups30d,
      appCollections,
      appRecords,
      events24h,
      mediaAssets,
      mediaBytes: mediaBytes._sum.size_bytes ?? 0,
      queuedJobs,
      deadLetteredJobs,
      pageAudit24h,
      appAudit24h,
    },
  };
}

export async function generateServiceRunbook(pageId: string): Promise<ServiceOpsRunbook> {
  const [profile, overview] = await Promise.all([getServiceOperationsProfile(pageId), buildServiceOperationsOverview(pageId)]);
  const stable = profile.releasePolicy.stableEnvironment;
  const preview = profile.releasePolicy.previewEnvironment;

  return {
    generatedAt: new Date().toISOString(),
    sections: {
      release: [
        `릴리즈는 ${preview}에서 먼저 검증하고 ${stable}로 승격합니다.`,
        profile.releasePolicy.requireApproval ? "안정 환경 배포 전 승인 확인이 필요합니다." : "안정 환경 배포는 승인 없이 가능합니다.",
        profile.releasePolicy.allowDirectProdDeploy ? "직접 운영 배포가 허용됩니다." : "운영 직접 배포는 기본 금지입니다.",
        `최근 30일 릴리즈 수: ${overview.metrics.releases30d}`,
      ],
      rollback: [
        `복구 전 최신 백업 스냅샷을 확인합니다.`,
        `현재 운영 버전: ${overview.deployment.currentVersionId ?? "없음"}`,
        `마지막 롤백 계획 대상 버전: ${profile.lastRollbackPlan?.targetVersionId ?? "없음"}`,
      ],
      backup: [
        profile.recoveryPolicy.backupBeforeDeploy ? "배포 전 백업이 필수입니다." : "배포 전 백업은 선택입니다.",
        `백업 보관 수: ${profile.recoveryPolicy.retainBackups}`,
        profile.recoveryPolicy.restoreRequiresApproval ? "복구는 승인 후 실행합니다." : "복구는 바로 실행 가능합니다.",
        `최근 30일 백업 수: ${overview.metrics.backups30d}`,
      ],
      migration: [
        `마이그레이션 전략: ${profile.migrationPolicy.strategy}`,
        profile.migrationPolicy.requireBackup ? "마이그레이션 전 백업이 필요합니다." : "백업은 선택입니다.",
        profile.migrationPolicy.requireStagingValidation ? "staging 검증 후 운영 반영합니다." : "staging 검증은 선택입니다.",
        profile.migrationPolicy.allowAutoRollback ? "실패 시 자동 롤백을 허용합니다." : "자동 롤백은 비활성화되어 있습니다.",
      ],
      incidents: [
        profile.incidentPolicy.enabled ? "장애 대응 알림이 활성화되어 있습니다." : "장애 대응 알림이 비활성화되어 있습니다.",
        `대기열 경보 기준: ${profile.incidentPolicy.queueBacklogThreshold}`,
        `지연 경보 기준(ms): ${profile.incidentPolicy.latencyThresholdMs}`,
        `백업 실패 허용 횟수: ${profile.incidentPolicy.backupFailureThreshold}`,
        ...profile.runbookNotes,
      ],
    },
  };
}
