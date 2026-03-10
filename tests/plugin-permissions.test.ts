// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  pageSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { setPlugins } from "@/lib/app-plugins";

describe("plugin permissions and compatibility", () => {
  beforeEach(() => {
    prismaMock.pageSetting.upsert.mockReset();
    prismaMock.pageSetting.findUnique.mockReset();
    prismaMock.pageSetting.findUnique.mockResolvedValue({ value: [] });
  });

  it("filters actions without required permissions", async () => {
    const result = await setPlugins("page-1", [
      {
        id: "no-perm",
        name: "No Permission",
        permissions: ["editor"],
        actions: [{ id: "open", label: "Open", type: "openUrl", url: "https://example.com" }],
      },
    ]);
    expect(result.length).toBe(0);
  });

  it("rejects incompatible versions", async () => {
    const result = await setPlugins("page-1", [
      {
        id: "future",
        name: "Future Plugin",
        minAppVersion: "9.9.9",
        actions: [{ id: "align", label: "Align", type: "align" }],
      },
    ]);
    expect(result.length).toBe(0);
  });
});
