import { randomUUID } from "crypto";

import { prisma } from "@/lib/db";
import {
  appendStoreAuditEntry,
  createDefaultStoreGovernanceState,
  setApprovalRequestStatus,
  toggleSavedEntry,
  type SavedStoreEntry,
  type StoreApprovalRequest,
  type StoreAuditEntry,
  type StoreGovernancePolicy,
  type StoreGovernanceState,
  type StoreResourceType,
  updateStorePolicy,
  upsertApprovalRequest,
} from "@/advanced/ui/storeGovernanceModel";

const STORE_GOVERNANCE_KEY = "store_governance";

function normalizeState(raw: unknown): StoreGovernanceState {
  const base = createDefaultStoreGovernanceState();
  if (!raw || typeof raw !== "object") return base;
  const input = raw as Record<string, unknown>;
  return {
    saved: Array.isArray(input.saved) ? (input.saved as SavedStoreEntry[]) : base.saved,
    requests: Array.isArray(input.requests) ? (input.requests as StoreApprovalRequest[]) : base.requests,
    policy: input.policy && typeof input.policy === "object" ? ({ ...base.policy, ...(input.policy as StoreGovernancePolicy) }) : base.policy,
    audit: Array.isArray(input.audit) ? (input.audit as StoreAuditEntry[]) : base.audit,
  };
}

async function setState(pageId: string, state: StoreGovernanceState) {
  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: STORE_GOVERNANCE_KEY } },
    update: { value: state as unknown as object },
    create: { page_id: pageId, key: STORE_GOVERNANCE_KEY, value: state as unknown as object },
  });
  return state;
}

export async function getStoreGovernance(pageId: string) {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: STORE_GOVERNANCE_KEY } },
    select: { value: true },
  });
  return normalizeState(row?.value);
}

export async function toggleStoreSaved(pageId: string, type: StoreResourceType, storeId: string, actorUserId?: string | null) {
  const current = await getStoreGovernance(pageId);
  let next = toggleSavedEntry(current, type, storeId);
  next = appendStoreAuditEntry(next, {
    id: randomUUID(),
    action: "store_saved_toggle",
    type,
    storeId,
    actorUserId,
    createdAt: new Date().toISOString(),
    meta: null,
  });
  return setState(pageId, next);
}

export async function requestStoreApproval(
  pageId: string,
  type: StoreResourceType,
  storeId: string,
  actorUserId?: string | null,
  note?: string | null,
) {
  const current = await getStoreGovernance(pageId);
  const now = new Date().toISOString();
  let next = upsertApprovalRequest(current, {
    id: randomUUID(),
    type,
    storeId,
    status: "requested",
    requestedAt: now,
    updatedAt: now,
    requestedByUserId: actorUserId ?? null,
    decidedByUserId: null,
    note: note ?? null,
  });
  next = appendStoreAuditEntry(next, {
    id: randomUUID(),
    action: "store_approval_requested",
    type,
    storeId,
    actorUserId,
    createdAt: now,
    meta: note ? { note } : null,
  });
  return setState(pageId, next);
}

export async function decideStoreApproval(
  pageId: string,
  requestId: string,
  status: "approved" | "rejected",
  actorUserId?: string | null,
  note?: string | null,
) {
  const current = await getStoreGovernance(pageId);
  const request = current.requests.find((item) => item.id === requestId);
  if (!request) return current;
  let next = setApprovalRequestStatus(current, requestId, status, actorUserId, note);
  next = appendStoreAuditEntry(next, {
    id: randomUUID(),
    action: `store_approval_${status}`,
    type: request.type,
    storeId: request.storeId,
    actorUserId,
    createdAt: new Date().toISOString(),
    meta: note ? { note } : null,
  });
  return setState(pageId, next);
}

export async function setStorePolicy(pageId: string, patch: Partial<StoreGovernancePolicy>, actorUserId?: string | null) {
  const current = await getStoreGovernance(pageId);
  let next = updateStorePolicy(current, patch);
  next = appendStoreAuditEntry(next, {
    id: randomUUID(),
    action: "store_policy_updated",
    actorUserId,
    createdAt: new Date().toISOString(),
    meta: patch as Record<string, unknown>,
  });
  return setState(pageId, next);
}
