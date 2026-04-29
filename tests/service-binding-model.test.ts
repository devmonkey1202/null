import { describe, expect, it } from "vitest";

import {
  createDefaultServiceAction,
  describeServiceBindingIssues,
  findPrimaryServiceInteraction,
  getDefaultServiceDataSource,
  getDefaultStateTransition,
} from "@/advanced/ui/serviceBindingModel";

describe("service-binding-model", () => {
  it("provides service defaults for major actions", () => {
    expect(getDefaultServiceDataSource("reservation.transition")?.source).toBe("reservations.list");
    expect(getDefaultServiceDataSource("ticket.reply")?.source).toBe("tickets.list");
    expect(getDefaultServiceDataSource("policy.evaluate")?.source).toBe("policy.rules");
    expect(getDefaultStateTransition("crm.lead.move")?.machine).toBe("crmLead");
    expect(getDefaultStateTransition("billing.invoice.pay")?.to).toBe("paid");
  });

  it("creates default service interaction payloads", () => {
    const action = createDefaultServiceAction("auth.login");
    expect(action.type).toBe("service");
    expect(action.action).toBe("auth.login");
    expect(action.dataSource?.source).toBe("auth.session");
  });

  it("finds the primary click service interaction", () => {
    const interactions = [
      { id: "a", trigger: "hover", action: { type: "navigate", targetPageId: "page-1" } },
      { id: "b", trigger: "click", action: createDefaultServiceAction("ticket.create") },
    ] as const;

    expect(findPrimaryServiceInteraction(interactions as never)?.id).toBe("b");
  });

  it("reports missing keys and transition details", () => {
    expect(
      describeServiceBindingIssues(
        {
          field: { key: "", valueType: "string" },
          stateTransition: { machine: "reservation", to: "", recordIdField: "", statusField: "status" },
        },
        "reservation.transition",
      ),
    ).toEqual([
      "필드 바인딩 key가 비어 있습니다.",
      "상태 전이 목표값이 비어 있습니다.",
      "상태 전이 recordIdField가 필요합니다.",
    ]);
  });
});
