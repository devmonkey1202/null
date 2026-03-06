// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appWorkflow: {
    findUnique: vi.fn(),
  },
  appWorkflowLog: {
    create: vi.fn(),
    update: vi.fn(),
  },
  appRecord: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { executeWorkflow } from "@/lib/app-workflow";

describe("workflow execution retries", () => {
  beforeEach(() => {
    prismaMock.appWorkflow.findUnique.mockReset();
    prismaMock.appWorkflowLog.create.mockReset();
    prismaMock.appWorkflowLog.update.mockReset();
    prismaMock.appRecord.create.mockReset();
    prismaMock.appRecord.update.mockReset();
    prismaMock.appRecord.delete.mockReset();
  });

  it("retries non-api step and succeeds", async () => {
    prismaMock.appWorkflow.findUnique.mockResolvedValue({
      id: "wf1",
      enabled: true,
      steps: [
        {
          type: "create_record",
          collection: "items",
          data: { name: "alpha" },
          retries: 2,
          retryDelayMs: 0,
        },
      ],
    });
    prismaMock.appWorkflowLog.create.mockResolvedValue({ id: "log1" });
    prismaMock.appRecord.create
      .mockRejectedValueOnce(new Error("fail-1"))
      .mockRejectedValueOnce(new Error("fail-2"))
      .mockResolvedValue({ id: "rec1", data: {}, created_at: new Date(), updated_at: new Date() });

    const result = await executeWorkflow("wf1", "page1");
    expect(result.status).toBe("success");
    expect(prismaMock.appRecord.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.appWorkflowLog.update).toHaveBeenCalled();
    const updateArgs = prismaMock.appWorkflowLog.update.mock.calls[0]?.[0];
    expect(updateArgs?.data?.status).toBe("success");
  });

  it("returns error when retries exhausted", async () => {
    prismaMock.appWorkflow.findUnique.mockResolvedValue({
      id: "wf2",
      enabled: true,
      steps: [
        {
          type: "create_record",
          collection: "items",
          data: { name: "beta" },
          retries: 1,
          retryDelayMs: 0,
        },
      ],
    });
    prismaMock.appWorkflowLog.create.mockResolvedValue({ id: "log2" });
    prismaMock.appRecord.create.mockRejectedValue(new Error("always-fail"));

    const result = await executeWorkflow("wf2", "page1");
    expect(result.status).toBe("error");
    expect(prismaMock.appRecord.create).toHaveBeenCalledTimes(2);
    const updateArgs = prismaMock.appWorkflowLog.update.mock.calls[0]?.[0];
    expect(updateArgs?.data?.status).toBe("error");
  });

  it("retries api_call on retryable status", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ ok: false }),
        text: vi.fn().mockResolvedValue("err"),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: vi.fn().mockResolvedValue({ ok: false }),
        text: vi.fn().mockResolvedValue("err"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ ok: true }),
        text: vi.fn().mockResolvedValue("ok"),
      });

    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;

    prismaMock.appWorkflow.findUnique.mockResolvedValue({
      id: "wf3",
      enabled: true,
      steps: [
        {
          type: "api_call",
          url: "https://example.com/test",
          method: "GET",
          retries: 2,
          retryDelayMs: 0,
          retryOn: [500, 502],
        },
      ],
    });
    prismaMock.appWorkflowLog.create.mockResolvedValue({ id: "log3" });

    const result = await executeWorkflow("wf3", "page1");
    expect(result.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    global.fetch = originalFetch;
  });
});
