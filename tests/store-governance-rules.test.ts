import { describe, expect, it } from "vitest";

import { createDefaultStoreGovernanceState, upsertApprovalRequest } from "@/advanced/ui/storeGovernanceModel";
import { getStorePluginGovernanceState, getStoreWidgetGovernanceState } from "@/lib/store-governance-rules";

describe("store governance rules", () => {
  it("blocks plugin install when policy disallows requested permissions", () => {
    const state = createDefaultStoreGovernanceState("2026-03-20T00:00:00.000Z");
    state.policy.allowedPermissions = ["editor", "ui"];
    const result = getStorePluginGovernanceState(
      {
        storeId: "store-import-web",
        approvalRequired: false,
        permissions: ["editor", "network"],
      },
      state.policy,
      state.requests,
    );

    expect(result.blockedPermissions).toEqual(["network"]);
    expect(result.canInstall).toBe(false);
    expect(result.canSave).toBe(true);
  });

  it("allows plugin install after approval when policy requires it", () => {
    const base = createDefaultStoreGovernanceState("2026-03-20T00:00:00.000Z");
    base.policy.pluginApprovalRequired = true;
    const requested = upsertApprovalRequest(base, {
      id: "req_plugin",
      type: "plugin",
      storeId: "store-performance",
      status: "approved",
      requestedAt: "2026-03-20T00:01:00.000Z",
      updatedAt: "2026-03-20T00:02:00.000Z",
      requestedByUserId: "user_1",
      decidedByUserId: "admin_1",
      note: "approved",
    });

    const result = getStorePluginGovernanceState(
      {
        storeId: "store-performance",
        approvalRequired: true,
        permissions: ["ui"],
      },
      requested.policy,
      requested.requests,
    );

    expect(result.approval).toBe("approved");
    expect(result.canInstall).toBe(true);
  });

  it("blocks widget insert until approval is granted", () => {
    const state = createDefaultStoreGovernanceState("2026-03-20T00:00:00.000Z");
    state.policy.widgetApprovalRequired = true;

    const blocked = getStoreWidgetGovernanceState(
      { storeId: "widget-team-board", approvalRequired: true },
      state.policy,
      state.requests,
    );
    expect(blocked.canInsert).toBe(false);
    expect(blocked.canRequestApproval).toBe(true);

    const approvedState = upsertApprovalRequest(state, {
      id: "req_widget",
      type: "widget",
      storeId: "widget-team-board",
      status: "approved",
      requestedAt: "2026-03-20T00:01:00.000Z",
      updatedAt: "2026-03-20T00:02:00.000Z",
      requestedByUserId: "user_1",
      decidedByUserId: "admin_1",
      note: null,
    });

    const approved = getStoreWidgetGovernanceState(
      { storeId: "widget-team-board", approvalRequired: true },
      approvedState.policy,
      approvedState.requests,
    );
    expect(approved.canInsert).toBe(true);
    expect(approved.canUpdate).toBe(true);
  });
});
