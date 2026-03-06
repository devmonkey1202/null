// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  page: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  pageVersion: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { allocateAnonNumber, createDraftPage } from "@/lib/pages";

describe("transactions and locks", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockReset();
    prismaMock.$executeRaw.mockReset();
    prismaMock.page.findMany.mockReset();
    prismaMock.page.create.mockReset();
    prismaMock.page.update.mockReset();
    prismaMock.pageVersion.create.mockReset();
  });

  it("acquires advisory lock when allocating anon number", async () => {
    const tx = {
      $executeRaw: prismaMock.$executeRaw,
      page: {
        findMany: prismaMock.page.findMany,
      },
    };
    prismaMock.page.findMany.mockResolvedValue([{ anon_number: 1 }, { anon_number: 2 }]);
    const next = await allocateAnonNumber(tx as any);
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
    expect(next).toBe(3);
  });

  it("creates draft page inside a transaction", async () => {
    const tx = {
      $executeRaw: prismaMock.$executeRaw,
      page: prismaMock.page,
      pageVersion: prismaMock.pageVersion,
    };
    prismaMock.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(tx));
    prismaMock.page.findMany.mockResolvedValue([]);
    prismaMock.page.create.mockResolvedValue({ id: "p1", owner_id: "u1" });
    prismaMock.pageVersion.create.mockResolvedValue({ id: "v1" });

    const result = await createDraftPage({ ownerId: "u1", title: "Test", contentJson: { type: "doc" } });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.page.create).toHaveBeenCalled();
    expect(prismaMock.pageVersion.create).toHaveBeenCalled();
    expect(result.page.id).toBe("p1");
    expect(result.version.id).toBe("v1");
  });
});
