// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  appCollection: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  appRecord: {
    findMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
  },
  appRecordVersion: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { setSchema, rollbackSchemaMigration } from "@/lib/app-data";

describe("schema migrations", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockReset();
    prismaMock.appCollection.upsert.mockReset();
    prismaMock.appCollection.deleteMany.mockReset();
    prismaMock.appRecord.findMany.mockReset();
    prismaMock.appRecord.update.mockReset();
    prismaMock.appRecord.deleteMany.mockReset();
    prismaMock.appRecord.findFirst.mockReset();
    prismaMock.appRecordVersion.create.mockReset();
    prismaMock.appRecordVersion.findMany.mockReset();
  });

  it("applies rename/delete/default migrations", async () => {
    const tx = {
      appCollection: prismaMock.appCollection,
      appRecord: prismaMock.appRecord,
    };
    prismaMock.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(tx));

    prismaMock.appRecord.findMany
      .mockResolvedValueOnce([
        { id: "r1", data: { old: "v1", remove: "x" } },
      ])
      .mockResolvedValueOnce([]);

    await setSchema(
      "page1",
      [{ slug: "posts", name: "Posts", fields: [{ name: "new", type: "string" }] }],
      {
        migrations: {
          renameFields: { posts: { old: "new" } },
          deleteFields: { posts: ["remove"] },
          defaults: { posts: { added: 1 } },
        },
        batchSize: 50,
      },
    );

    expect(prismaMock.appRecord.update).toHaveBeenCalledTimes(1);
    const updateArgs = prismaMock.appRecord.update.mock.calls[0]?.[0];
    expect(updateArgs?.data?.data?.new).toBe("v1");
    expect(updateArgs?.data?.data?.added).toBe(1);
    expect(updateArgs?.data?.data?.remove).toBeUndefined();
  });

  it("rolls back schema migrations using recorded versions", async () => {
    prismaMock.appRecordVersion.findMany
      .mockResolvedValueOnce([
        {
          id: "v1",
          record_id: "r1",
          collection_slug: "posts",
          data: { title: "old" },
        },
      ])
      .mockResolvedValueOnce([]);

    prismaMock.appRecord.findFirst.mockResolvedValue({ id: "r1" });
    prismaMock.appRecord.update.mockResolvedValue({ id: "r1" });

    const result = await rollbackSchemaMigration("page1", "mig123", { batchSize: 50 });
    expect(result.restored).toBe(1);
    expect(prismaMock.appRecord.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { data: { title: "old" }, updated_at: expect.any(Date) },
    });
    expect(prismaMock.appRecordVersion.create).toHaveBeenCalledWith({
      data: {
        page_id: "page1",
        record_id: "r1",
        collection_slug: "posts",
        action: "schema_rollback:mig123",
        data: { title: "old" },
        actor_user_id: null,
        actor_app_user_id: null,
        actor_anon_id: null,
      },
    });
  });
});
