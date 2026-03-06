// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseWorkflowCreate } from "@/lib/workflow-schema";

describe("workflow schema validation", () => {
  it("accepts valid api_call step and normalizes method", () => {
    const result = parseWorkflowCreate({
      name: "Sample",
      trigger: { type: "schedule", cron: "0 0 * * *" },
      steps: [
        {
          type: "api_call",
          url: "https://example.com/hook",
          method: "post",
          headers: { "x-test": "1" },
          retryOn: [500, 503],
          timeoutMs: 5000,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const step = result.data.steps[0] as { method?: string };
      expect(step.method).toBe("POST");
    }
  });

  it("rejects invalid api_call url", () => {
    const result = parseWorkflowCreate({
      name: "Bad",
      trigger: { type: "schedule", cron: "0 0 * * *" },
      steps: [{ type: "api_call", url: "not-a-url", method: "GET" }],
    });

    expect(result.success).toBe(false);
  });
});
