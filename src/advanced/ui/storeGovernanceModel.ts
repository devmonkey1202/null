export type StoreResourceType = "plugin" | "widget";
export type StoreApprovalStatus = "requested" | "approved" | "rejected";
export type StoreGovernanceScope = "page" | "org";

export type SavedStoreEntry = {
  type: StoreResourceType;
  storeId: string;
  savedAt: string;
};

export type StoreApprovalRequest = {
  id: string;
  type: StoreResourceType;
  storeId: string;
  status: StoreApprovalStatus;
  requestedAt: string;
  updatedAt: string;
  requestedByUserId?: string | null;
  decidedByUserId?: string | null;
  note?: string | null;
};

export type StoreGovernancePolicy = {
  scope: StoreGovernanceScope;
  pluginApprovalRequired: boolean;
  widgetApprovalRequired: boolean;
  allowSave: boolean;
  allowedPermissions: string[];
  updatedAt: string;
};

export type StoreAuditEntry = {
  id: string;
  action: string;
  type?: StoreResourceType;
  storeId?: string;
  actorUserId?: string | null;
  createdAt: string;
  meta?: Record<string, unknown> | null;
};

export type StoreGovernanceState = {
  saved: SavedStoreEntry[];
  requests: StoreApprovalRequest[];
  policy: StoreGovernancePolicy;
  audit: StoreAuditEntry[];
};

export function createDefaultStoreGovernanceState(now = new Date().toISOString()): StoreGovernanceState {
  return {
    saved: [],
    requests: [],
    policy: {
      scope: "page",
      pluginApprovalRequired: false,
      widgetApprovalRequired: true,
      allowSave: true,
      allowedPermissions: ["editor", "export", "ui"],
      updatedAt: now,
    },
    audit: [],
  };
}

export function toggleSavedEntry(state: StoreGovernanceState, type: StoreResourceType, storeId: string, now = new Date().toISOString()) {
  const exists = state.saved.some((entry) => entry.type === type && entry.storeId === storeId);
  return {
    ...state,
    saved: exists
      ? state.saved.filter((entry) => !(entry.type === type && entry.storeId === storeId))
      : [...state.saved, { type, storeId, savedAt: now }],
  };
}

export function upsertApprovalRequest(state: StoreGovernanceState, request: StoreApprovalRequest) {
  const requests = state.requests.filter((item) => item.id !== request.id && !(item.type === request.type && item.storeId === request.storeId && item.status === "requested"));
  return {
    ...state,
    requests: [request, ...requests].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

export function setApprovalRequestStatus(
  state: StoreGovernanceState,
  requestId: string,
  status: StoreApprovalStatus,
  actorUserId?: string | null,
  note?: string | null,
  now = new Date().toISOString(),
) {
  return {
    ...state,
    requests: state.requests.map((item) =>
      item.id === requestId
        ? {
            ...item,
            status,
            updatedAt: now,
            decidedByUserId: actorUserId ?? item.decidedByUserId ?? null,
            note: note ?? item.note ?? null,
          }
        : item,
    ),
  };
}

export function updateStorePolicy(state: StoreGovernanceState, patch: Partial<StoreGovernancePolicy>, now = new Date().toISOString()) {
  return {
    ...state,
    policy: {
      ...state.policy,
      ...patch,
      allowedPermissions: patch.allowedPermissions ? [...patch.allowedPermissions] : [...state.policy.allowedPermissions],
      updatedAt: now,
    },
  };
}

export function appendStoreAuditEntry(state: StoreGovernanceState, entry: StoreAuditEntry) {
  return {
    ...state,
    audit: [entry, ...state.audit].slice(0, 100),
  };
}
