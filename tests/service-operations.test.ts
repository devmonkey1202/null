import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
}));

const prismaMock = vi.hoisted(() => ({
  pageSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  page: {
    findUnique: vi.fn(),
  },
  appCollection: { count: vi.fn() },
  appRecord: { count: vi.fn() },
  event: { count: vi.fn() },
  serviceMediaAsset: { count: vi.fn(), aggregate: vi.fn() },
  backgroundJob: { count: vi.fn() },
  backgroundJobDeadLetter: { count: vi.fn() },
  pageAuditLog: { count: vi.fn() },
  appAuditLog: { count: vi.fn() },
}));

const auditMock = vi.hoisted(() => ({
  logAppAudit: vi.fn(),
}));

const scalingMock = vi.hoisted(() => ({
  resolveScalingConfig: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-audit", () => auditMock);
vi.mock("@/lib/scaling", () => scalingMock);

import {
  buildServiceOperationsOverview,
  generateServiceRunbook,
  getServiceOperationsProfile,
  planServiceRollback,
  recordServiceBackupSnapshot,
  recordServiceReleaseSnapshot,
  upsertServiceOperationsProfile,
} from "@/lib/service-operations";

describe("service operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.settings.clear();

    state.settings.set("hosting", { customDomain: "app.example.com" });

    prismaMock.pageSetting.findUnique.mockImplementation(async ({ where }: { where: { page_id_key: { key: string } } }) => {
      const key = where.page_id_key.key;
      return state.settings.has(key) ? { value: state.settings.get(key) } : null;
    });
    prismaMock.pageSetting.upsert.mockImplementation(async ({ where, create, update }: { where: { page_id_key: { key: string } }; create: { value: unknown }; update: { value: unknown } }) => {
      const key = where.page_id_key.key;
      const value = update?.value ?? create.value;
      state.settings.set(key, value);
      return { value };
    });

    prismaMock.page.findUnique.mockResolvedValue({
      current_version_id: "ver_current",
      deployed_at: new Date("2026-03-23T12:00:00.000Z"),
    });
    prismaMock.appCollection.count.mockResolvedValue(4);
    prismaMock.appRecord.count.mockResolvedValue(120);
    prismaMock.event.count.mockResolvedValue(42);
    prismaMock.serviceMediaAsset.count.mockResolvedValue(3);
    prismaMock.serviceMediaAsset.aggregate.mockResolvedValue({ _sum: { size_bytes: 2048 } });
    prismaMock.backgroundJob.count.mockResolvedValue(5);
    prismaMock.backgroundJobDeadLetter.count.mockResolvedValue(1);
    prismaMock.pageAuditLog.count.mockResolvedValue(7);
    prismaMock.appAuditLog.count.mockResolvedValue(11);

    scalingMock.resolveScalingConfig.mockReturnValue({
      minInstances: 1,
      maxInstances: 6,
      targetCpuUtilization: 0.65,
      maxQueueDepth: 250,
      queueBackend: "redis",
      sessionStore: "redis",
      cacheStore: "redis",
      workerConcurrency: 12,
    });
    auditMock.logAppAudit.mockResolvedValue(undefined);
  });

  it("returns a default operations profile with derived environment urls", async () => {
    const profile = await getServiceOperationsProfile("page_1");

    expect(profile.environments.map((item) => item.key)).toEqual(["dev", "staging", "prod"]);
    expect(profile.environments.find((item) => item.key === "dev")?.url).toContain("/editor/advanced?pageId=page_1&env=dev");
    expect(profile.environments.find((item) => item.key === "prod")?.url).toBe("https://app.example.com");
    expect(profile.releasePolicy.stableEnvironment).toBe("prod");
  });

  it("updates the profile and records releases", async () => {
    const updated = await upsertServiceOperationsProfile({
      pageId: "page_1",
      patch: {
        runbookNotes: ["운영 채널: #ops"],
        incidentPolicy: { channels: ["slack:#ops"], latencyThresholdMs: 800 },
      },
      actor: { userId: "user_1" },
    });

    expect(updated.runbookNotes).toEqual(["운영 채널: #ops"]);
    expect(updated.incidentPolicy.channels).toEqual(["slack:#ops"]);
    expect(updated.incidentPolicy.latencyThresholdMs).toBe(800);

    const { profile, release } = await recordServiceReleaseSnapshot({
      pageId: "page_1",
      environmentKey: "prod",
      versionId: "ver_a",
      deployHash: "hash_a",
      deployUrl: "https://app.example.com",
      actor: { userId: "user_1" },
    });

    expect(release.versionId).toBe("ver_a");
    expect(profile.releases).toHaveLength(1);
    expect(profile.environments.find((item) => item.key === "prod")?.url).toBe("https://app.example.com");
  });

  it("plans rollback to the previous deployed release", async () => {
    await recordServiceReleaseSnapshot({
      pageId: "page_1",
      environmentKey: "prod",
      versionId: "ver_a",
      deployHash: "hash_a",
      deployUrl: "https://app.example.com",
      actor: { userId: "user_1" },
    });
    await recordServiceReleaseSnapshot({
      pageId: "page_1",
      environmentKey: "prod",
      versionId: "ver_b",
      deployHash: "hash_b",
      deployUrl: "https://app.example.com",
      actor: { userId: "user_1" },
    });

    const plan = await planServiceRollback({
      pageId: "page_1",
      environmentKey: "prod",
      currentVersionId: "ver_b",
      actor: { userId: "user_1" },
    });

    expect(plan.targetVersionId).toBe("ver_a");
    expect(plan.steps).toHaveLength(5);
  });

  it("records backups and produces overview + runbook", async () => {
    await recordServiceBackupSnapshot({
      pageId: "page_1",
      kind: "export",
      counts: { versions: 2, records: 10 },
      actor: { userId: "user_1" },
    });

    const overview = await buildServiceOperationsOverview("page_1");
    expect(overview.metrics.mediaBytes).toBe(2048);
    expect(overview.capacity.queueBackend).toBe("redis");
    expect(overview.deployment.currentVersionId).toBe("ver_current");

    const runbook = await generateServiceRunbook("page_1");
    expect(runbook.sections.release[0]).toContain("staging");
    expect(runbook.sections.backup[1]).toContain("20");
    expect(runbook.sections.incidents[1]).toContain("50");
  });
});
