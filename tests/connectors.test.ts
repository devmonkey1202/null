// @vitest-environment node
import { describe, it, expect } from "vitest";
import { listConnectorTemplates, validateConnectorConfig } from "@/lib/connectors";

describe("connectors catalog and validation", () => {
  it("lists connector templates", () => {
    const templates = listConnectorTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((t) => t.type === "oauth")).toBe(true);
  });

  it("validates connector configs", () => {
    const templates = listConnectorTemplates();
    const template = templates[0];
    const result = validateConnectorConfig({
      templateId: template.id,
      name: "My Connector",
      status: "active",
      schedule: { enabled: true, cron: "*/5 * * * *" },
      mapping: [{ source: "title", target: "title", type: "string" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid connector configs", () => {
    const result = validateConnectorConfig({
      templateId: "",
      name: "",
    });
    expect(result.success).toBe(false);
  });
});
