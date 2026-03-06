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
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { setSchema } from "@/lib/app-data";

describe("schema migrations", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockReset();
    prismaMock.appCollection.upsert.mockReset();
    prismaMock.appCollection.deleteMany.mockReset();
    prismaMock.appRecord.findMany.mockReset();
    prismaMock.appRecord.update.mockReset();
    prismaMock.appRecord.deleteMany.mockReset();
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
});
