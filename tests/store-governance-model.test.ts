import { describe, expect, it } from "vitest";

import {
  appendStoreAuditEntry,
  createDefaultStoreGovernanceState,
  setApprovalRequestStatus,
  toggleSavedEntry,
  updateStorePolicy,
  upsertApprovalRequest,
} from "@/advanced/ui/storeGovernanceModel";

describe("store governance model", () => {
  it("toggles saved plugin/widget entries", () => {
    const base = createDefaultStoreGovernanceState("2026-03-14T00:00:00.000Z");
    const saved = toggleSavedEntry(base, "plugin", "store-export-pack", "2026-03-14T00:01:00.000Z");
    expect(saved.saved).toEqual([{ type: "plugin", storeId: "store-export-pack", savedAt: "2026-03-14T00:01:00.000Z" }]);
    const cleared = toggleSavedEntry(saved, "plugin", "store-export-pack", "2026-03-14T00:02:00.000Z");
    expect(cleared.saved).toEqual([]);
  });

  it("creates approval requests and resolves them", () => {
    const base = createDefaultStoreGovernanceState("2026-03-14T00:00:00.000Z");
    const requested = upsertApprovalRequest(base, {
      id: "req_1",
      type: "widget",
      storeId: "widget-team-board",
      status: "requested",
      requestedAt: "2026-03-14T00:01:00.000Z",
      updatedAt: "2026-03-14T00:01:00.000Z",
      requestedByUserId: "user_1",
      decidedByUserId: null,
      note: "Need team rollout",
    });
    expect(requested.requests).toHaveLength(1);

    const approved = setApprovalRequestStatus(requested, "req_1", "approved", "admin_1", "approved", "2026-03-14T00:02:00.000Z");
    expect(approved.requests[0]).toMatchObject({
      status: "approved",
      decidedByUserId: "admin_1",
      note: "approved",
    });
  });

  it("updates policy and appends audit entries", () => {
    const base = createDefaultStoreGovernanceState("2026-03-14T00:00:00.000Z");
    const updated = updateStorePolicy(base, {
      scope: "org",
      pluginApprovalRequired: true,
      allowedPermissions: ["editor", "export"],
    }, "2026-03-14T00:03:00.000Z");
    expect(updated.policy).toMatchObject({
      scope: "org",
      pluginApprovalRequired: true,
      allowedPermissions: ["editor", "export"],
    });

    const audited = appendStoreAuditEntry(updated, {
      id: "audit_1",
      action: "store_policy_updated",
      actorUserId: "admin_1",
      createdAt: "2026-03-14T00:04:00.000Z",
      meta: { scope: "org" },
    });
    expect(audited.audit[0]?.action).toBe("store_policy_updated");
  });
});
