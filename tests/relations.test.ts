import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appRecord: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { expandRelations, validateRelationTargets, type AppFieldDef } from "@/lib/app-data";

describe("relation helpers", () => {
  beforeEach(() => {
    prismaMock.appRecord.findMany.mockReset();
  });

  it("validates relation targets", async () => {
    const fields: AppFieldDef[] = [{ name: "author", type: "relation" }];
    prismaMock.appRecord.findMany.mockResolvedValue([{ id: "a1" }]);
    const result = await validateRelationTargets("page1", fields, { author: "a1", extra: "x" });
    expect(result.ok).toBe(true);

    prismaMock.appRecord.findMany.mockResolvedValue([{ id: "a1" }]);
    const missing = await validateRelationTargets("page1", fields, { author: ["a1", "a2"] });
    expect(missing.ok).toBe(false);
    expect(missing.missing).toEqual(["a2"]);
  });

  it("expands relation fields into relations map", async () => {
    const fields: AppFieldDef[] = [{ name: "author", type: "relation" }];
    prismaMock.appRecord.findMany.mockResolvedValue([
      { id: "a1", data: { name: "User" }, created_at: new Date(), updated_at: new Date(), app_user_id: null },
    ]);
    const items = await expandRelations(
      "page1",
      fields,
      [
        {
          id: "r1",
          data: { author: "a1" },
          created_at: new Date(),
          updated_at: new Date(),
          app_user_id: null,
        },
      ],
      ["author"]
    );
    const authorRelations = (items[0]?.relations as Record<string, Array<{ id: string }>> | undefined)?.author;
    expect(authorRelations?.[0]?.id).toBe("a1");
  });
});
