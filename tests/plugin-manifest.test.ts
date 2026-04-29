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

describe("plugin manifest normalization", () => {
  beforeEach(() => {
    prismaMock.pageSetting.upsert.mockReset();
    prismaMock.pageSetting.findUnique.mockReset();
    prismaMock.pageSetting.findUnique.mockResolvedValue({ value: [] });
  });

  it("filters invalid manifests and actions", async () => {
    const result = await setPlugins("page-1", [
      {
        id: "bad",
        name: "Bad",
        actions: [{ id: "x", label: "X", type: "unknown" }],
      },
      {
        id: "bad-url",
        name: "Bad URL",
        actions: [{ id: "o", label: "Open", type: "openUrl", url: "ftp://evil.test" }],
      },
      {
        id: "good",
        name: "Good",
        permissions: ["editor", "network"],
        actions: [
          { id: "a1", label: "Align", type: "align" },
          { id: "o1", label: "Open", type: "openUrl", url: "https://example.com" },
        ],
      },
    ]);

    const ids = result.map((p) => p.id);
    expect(ids).toEqual(["good"]);
    expect(prismaMock.pageSetting.upsert).toHaveBeenCalled();
  });

  it("normalizes macro steps", async () => {
    const result = await setPlugins("page-2", [
      {
        id: "macro",
        name: "Macro Plugin",
        permissions: ["editor"],
        actions: [
          {
            id: "m1",
            label: "Macro",
            type: "macro",
            steps: [
              { id: "a1", label: "Align", type: "align" },
              { id: "a2", label: "Distribute", type: "distribute" },
            ],
          },
        ],
      },
    ]);

    expect(result[0]?.actions?.length).toBe(1);
    const macro = result[0]?.actions?.[0] as { steps?: unknown[] };
    expect(Array.isArray(macro?.steps)).toBe(true);
  });

  it("accepts importWeb actions with editor and network permissions", async () => {
    const result = await setPlugins("page-3", [
      {
        id: "web-import",
        name: "Web Import",
        permissions: ["editor", "network"],
        actions: [
          {
            id: "import-url",
            label: "Import URL",
            type: "importWeb",
            params: { url: "https://example.com", viewportId: "tablet" },
          },
        ],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.actions[0]?.type).toBe("importWeb");
  });
});
