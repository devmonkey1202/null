// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const redisStore = new Map<string, string>();
const redisMock = {
  get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    redisStore.set(key, value);
    return "OK";
  }),
  incr: vi.fn(async (key: string) => {
    const current = Number(redisStore.get(key) ?? "0") || 0;
    const next = current + 1;
    redisStore.set(key, String(next));
    return next;
  }),
};

const prismaMock = vi.hoisted(() => ({
  appRecord: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  appRecordVersion: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/redis", () => ({ getRedis: () => redisMock }));

import { listRecords, createRecord } from "@/lib/app-data";
import { resetAppDataCacheForTests } from "@/lib/app-data-cache";

describe("app data cache layer", () => {
  beforeEach(() => {
    prismaMock.appRecord.findMany.mockReset();
    prismaMock.appRecord.count.mockReset();
    prismaMock.appRecord.create.mockReset();
    prismaMock.appRecordVersion.create.mockReset();
    redisStore.clear();
    redisMock.get.mockClear();
    redisMock.set.mockClear();
    redisMock.incr.mockClear();
    resetAppDataCacheForTests();
  });

  it("caches listRecords results", async () => {
    prismaMock.appRecord.findMany.mockResolvedValue([
      { id: "r1", data: { title: "A" }, created_at: new Date(), updated_at: new Date(), app_user_id: null },
    ]);
    prismaMock.appRecord.count.mockResolvedValue(1);

    const first = await listRecords("page1", "posts", { limit: 10, offset: 0 });
    const second = await listRecords("page1", "posts", { limit: 10, offset: 0 });

    expect(first.total).toBe(1);
    expect(second.total).toBe(1);
    expect(prismaMock.appRecord.findMany).toHaveBeenCalledTimes(1);
    expect(redisMock.set).toHaveBeenCalled();
  });

  it("invalidates cache on createRecord", async () => {
    prismaMock.appRecord.findMany.mockResolvedValue([
      { id: "r1", data: { title: "A" }, created_at: new Date(), updated_at: new Date(), app_user_id: null },
    ]);
    prismaMock.appRecord.count.mockResolvedValue(1);

    await listRecords("page1", "posts", { limit: 10, offset: 0 });
    await listRecords("page1", "posts", { limit: 10, offset: 0 });
    expect(prismaMock.appRecord.findMany).toHaveBeenCalledTimes(1);

    prismaMock.appRecord.create.mockResolvedValue({
      id: "r2",
      data: { title: "B" },
      created_at: new Date(),
      updated_at: new Date(),
    });
    prismaMock.appRecordVersion.create.mockResolvedValue({ id: "v1" });

    await createRecord("page1", "posts", { title: "B" });
    await listRecords("page1", "posts", { limit: 10, offset: 0 });

    expect(prismaMock.appRecord.findMany).toHaveBeenCalledTimes(2);
    expect(redisMock.incr).toHaveBeenCalled();
  });
});
