// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("workflow loop optimization", () => {
  beforeEach(() => {
    prismaMock.appWorkflow.findUnique.mockReset();
    prismaMock.appWorkflowLog.create.mockReset();
    prismaMock.appWorkflowLog.update.mockReset();
    prismaMock.appRecord.create.mockReset();
  });

  it("truncates loops beyond maxItems", async () => {
    prismaMock.appWorkflow.findUnique.mockResolvedValue({
      id: "wf_loop",
      enabled: true,
      steps: [
        { type: "set_variable", key: "items", value: [1, 2, 3, 4] },
        {
          type: "loop",
          items: "items",
          variable: "item",
          maxItems: 2,
          steps: [{ type: "log", message: "Item {{item}}" }],
        },
      ],
    });
    prismaMock.appWorkflowLog.create.mockResolvedValue({ id: "log_loop" });

    const result = await executeWorkflow("wf_loop", "page1");
    expect(result.status).toBe("success");
    expect(result.logs).toContain("Item 1");
    expect(result.logs).toContain("Item 2");
    expect(result.logs.some((log) => log.startsWith("loop_truncated:"))).toBe(true);
  });
});
