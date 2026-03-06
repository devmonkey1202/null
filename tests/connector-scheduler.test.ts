// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { runConnectorSchedules } from "@/lib/connector-scheduler";

describe("connector scheduler", () => {
  it("runs due connectors and updates settings", async () => {
    const now = new Date("2026-03-05T12:00:00Z");
    const db = {
      pageSetting: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
    };
    const connector = {
      id: "conn1",
      templateId: "custom-webhook",
      name: "Custom",
      status: "active",
      schedule: { enabled: true, cron: "* * * * *" },
      config: { baseUrl: "https://example.com" },
      lastSyncedAt: "2026-03-05T11:58:00Z",
    };

    db.pageSetting.findMany.mockResolvedValue([
      { page_id: "page1", value: [connector] },
    ]);

    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const results = await runConnectorSchedules(now, { db: db as any, fetcher });
    expect(results.length).toBe(1);
    expect(results[0]?.results[0]?.status).toBe("success");
    expect(db.pageSetting.upsert).toHaveBeenCalled();
  });
});
