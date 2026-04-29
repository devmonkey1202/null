import type { StoreApprovalRequest, StoreGovernancePolicy, StoreResourceType } from "@/advanced/ui/storeGovernanceModel";
import type { StorePlugin } from "@/lib/plugin-store";
import type { StoreWidget } from "@/lib/widget-store";

export type StoreApprovalState = "not-required" | "required" | "requested" | "approved" | "rejected";

export type StorePluginGovernanceState = {
  approval: StoreApprovalState;
  blockedPermissions: string[];
  canSave: boolean;
  canRequestApproval: boolean;
  canInstall: boolean;
};

export type StoreWidgetGovernanceState = {
  approval: StoreApprovalState;
  canSave: boolean;
  canRequestApproval: boolean;
  canInsert: boolean;
  canUpdate: boolean;
};

function compareIsoDesc(left?: string | null, right?: string | null) {
  return (right ?? "").localeCompare(left ?? "");
}

export function getLatestStoreApprovalRequest(
  requests: StoreApprovalRequest[],
  type: StoreResourceType,
  storeId: string,
) {
  return requests
    .filter((request) => request.type === type && request.storeId === storeId)
    .sort((left, right) => compareIsoDesc(left.updatedAt ?? left.requestedAt, right.updatedAt ?? right.requestedAt))[0] ?? null;
}

export function getStoreApprovalState(
  policy: StoreGovernancePolicy,
  type: StoreResourceType,
  storeId: string,
  requests: StoreApprovalRequest[],
  approvalRequired: boolean,
): StoreApprovalState {
  if (!approvalRequired) return "not-required";
  const latest = getLatestStoreApprovalRequest(requests, type, storeId);
  if (!latest) return "required";
  return latest.status;
}

export function getBlockedPluginPermissions(policy: StoreGovernancePolicy, plugin: Pick<StorePlugin, "permissions">) {
  const allowed = new Set(policy.allowedPermissions ?? []);
  return (plugin.permissions ?? []).filter((permission) => !allowed.has(permission));
}

export function getStorePluginGovernanceState(
  plugin: Pick<StorePlugin, "storeId" | "approvalRequired" | "permissions">,
  policy: StoreGovernancePolicy,
  requests: StoreApprovalRequest[],
): StorePluginGovernanceState {
  const approval = getStoreApprovalState(
    policy,
    "plugin",
    plugin.storeId,
    requests,
    Boolean(policy.pluginApprovalRequired || plugin.approvalRequired),
  );
  const blockedPermissions = getBlockedPluginPermissions(policy, plugin);
  const canSave = Boolean(policy.allowSave);
  const canRequestApproval = approval === "required" || approval === "rejected";
  const canInstall = blockedPermissions.length === 0 && (approval === "not-required" || approval === "approved");
  return { approval, blockedPermissions, canSave, canRequestApproval, canInstall };
}

export function getStoreWidgetGovernanceState(
  widget: Pick<StoreWidget, "storeId" | "approvalRequired">,
  policy: StoreGovernancePolicy,
  requests: StoreApprovalRequest[],
): StoreWidgetGovernanceState {
  const approval = getStoreApprovalState(
    policy,
    "widget",
    widget.storeId,
    requests,
    Boolean(policy.widgetApprovalRequired || widget.approvalRequired),
  );
  const canSave = Boolean(policy.allowSave);
  const canRequestApproval = approval === "required" || approval === "rejected";
  const canInsert = approval === "not-required" || approval === "approved";
  const canUpdate = canInsert;
  return { approval, canSave, canRequestApproval, canInsert, canUpdate };
}

export function formatStoreApprovalLabel(state: StoreApprovalState) {
  switch (state) {
    case "not-required":
      return "ready";
    case "required":
      return "approval required";
    case "requested":
      return "approval requested";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      return state;
  }
}
