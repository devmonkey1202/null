import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";
import { applyServicePolicyRuntimeExtensions } from "@/lib/service-runtime-extensions";

export type ServicePolicyEffect = "allow" | "deny" | "review";
export type ServiceApprovalStatus = "requested" | "approved" | "rejected" | "canceled";
export type ServiceRiskStatus = "open" | "reviewing" | "blocked" | "resolved";
export type ServiceRiskSanctionType = "block" | "review" | "limit";

const policyPrisma = prisma as unknown as {
  servicePolicyRule: Prisma.ServicePolicyRuleDelegate;
  servicePolicyApprovalRequest: Prisma.ServicePolicyApprovalRequestDelegate;
  servicePolicyOverride: Prisma.ServicePolicyOverrideDelegate;
  serviceRiskIncident: Prisma.ServiceRiskIncidentDelegate;
  serviceRiskSanction: Prisma.ServiceRiskSanctionDelegate;
};

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function normalizeEffect(value: unknown): ServicePolicyEffect {
  if (value === "deny" || value === "review") return value;
  return "allow";
}

function normalizeApprovalStatus(value: unknown): ServiceApprovalStatus {
  if (value === "approved" || value === "rejected" || value === "canceled") return value;
  return "requested";
}

function normalizeRiskStatus(value: unknown): ServiceRiskStatus {
  if (value === "reviewing" || value === "blocked" || value === "resolved") return value;
  return "open";
}

function normalizeSanctionType(value: unknown): ServiceRiskSanctionType {
  if (value === "review" || value === "limit") return value;
  return "block";
}

function normalizeKey(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || fallback;
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePriority(value: unknown, fallback = 100) {
  const num = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(10_000, Math.round(num)));
}

function normalizeScore(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, num);
}

function parseDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function toObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function valueMatches(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) return expected.some((entry) => valueMatches(entry, actual));
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const record = expected as Record<string, unknown>;
    if (record.any !== undefined) {
      const anyValues = Array.isArray(record.any) ? record.any : [record.any];
      return anyValues.some((entry) => valueMatches(entry, actual));
    }
    if (record.not !== undefined) return !valueMatches(record.not, actual);
    if (record.min !== undefined || record.max !== undefined) {
      const num = typeof actual === "number" ? actual : Number(actual);
      if (!Number.isFinite(num)) return false;
      if (record.min !== undefined && num < Number(record.min)) return false;
      if (record.max !== undefined && num > Number(record.max)) return false;
      return true;
    }
  }
  return expected === actual;
}

function matchesConditions(rawConditions: unknown, context: Record<string, unknown>): boolean {
  const conditions = toObject(rawConditions);
  return Object.entries(conditions).every(([key, expected]) => valueMatches(expected, context[key]));
}

function matchesActionOrResource(target: string | null | undefined, current: string) {
  return !target || target === "*" || target === current;
}

function isActiveAt(now: Date, startsAt?: Date | null, expiresAt?: Date | null) {
  if (startsAt && startsAt.getTime() > now.getTime()) return false;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

async function audit(pageId: string, action: string, targetType: string, targetId: string | null, meta: Record<string, unknown> | null, actor?: AppAuditActor) {
  await logAppAudit({ pageId, action, targetType, targetId, meta, actor });
}

export async function upsertServicePolicyRule(input: {
  pageId: string;
  key: string;
  name: string;
  effect?: ServicePolicyEffect | string;
  actionKey?: string | null;
  resourceType?: string | null;
  priority?: number | null;
  enabled?: boolean;
  conditions?: unknown;
  metadata?: unknown;
  actor?: AppAuditActor;
}) {
  const key = normalizeKey(input.key, "rule");
  const record = await policyPrisma.servicePolicyRule.upsert({
    where: { page_id_key: { page_id: input.pageId, key } },
    update: {
      name: input.name,
      effect: normalizeEffect(input.effect),
      action_key: normalizeKey(input.actionKey, "*"),
      resource_type: normalizeKey(input.resourceType, "*"),
      priority: normalizePriority(input.priority, 100),
      enabled: input.enabled ?? true,
      conditions: asJson(input.conditions),
      metadata: asJson(input.metadata),
    },
    create: {
      page_id: input.pageId,
      key,
      name: input.name,
      effect: normalizeEffect(input.effect),
      action_key: normalizeKey(input.actionKey, "*"),
      resource_type: normalizeKey(input.resourceType, "*"),
      priority: normalizePriority(input.priority, 100),
      enabled: input.enabled ?? true,
      conditions: asJson(input.conditions),
      metadata: asJson(input.metadata),
    },
  });
  await audit(input.pageId, "service_policy_rule_upserted", "service_policy_rule", record.id, { key: record.key, effect: record.effect }, input.actor);
  return record;
}

export async function upsertServicePolicyOverride(input: {
  pageId: string;
  key: string;
  subjectKey: string;
  effect: ServicePolicyEffect | string;
  actionKey?: string | null;
  resourceType?: string | null;
  ruleId?: string | null;
  reason?: string | null;
  enabled?: boolean;
  expiresAt?: string | Date | null;
  metadata?: unknown;
  actor?: AppAuditActor;
}) {
  const key = normalizeKey(input.key, "override");
  const subjectKey = normalizeKey(input.subjectKey, "");
  if (!subjectKey) throw new Error("service_policy_subject_required");
  const record = await policyPrisma.servicePolicyOverride.upsert({
    where: { page_id_key: { page_id: input.pageId, key } },
    update: {
      rule_id: input.ruleId ?? null,
      subject_key: subjectKey,
      effect: normalizeEffect(input.effect),
      action_key: normalizeText(input.actionKey),
      resource_type: normalizeText(input.resourceType),
      reason: normalizeText(input.reason),
      enabled: input.enabled ?? true,
      expires_at: parseDate(input.expiresAt),
      metadata: asJson(input.metadata),
    },
    create: {
      page_id: input.pageId,
      key,
      rule_id: input.ruleId ?? null,
      subject_key: subjectKey,
      effect: normalizeEffect(input.effect),
      action_key: normalizeText(input.actionKey),
      resource_type: normalizeText(input.resourceType),
      reason: normalizeText(input.reason),
      enabled: input.enabled ?? true,
      expires_at: parseDate(input.expiresAt),
      metadata: asJson(input.metadata),
    },
  });
  await audit(input.pageId, "service_policy_override_upserted", "service_policy_override", record.id, { key: record.key, effect: record.effect, subjectKey: record.subject_key }, input.actor);
  return record;
}

export async function createServiceApprovalRequest(input: {
  pageId: string;
  actionKey: string;
  resourceType: string;
  subjectKey: string;
  subjectLabel?: string | null;
  targetKey?: string | null;
  ruleId?: string | null;
  note?: string | null;
  context?: unknown;
  requestedByUserId?: string | null;
  requestedByAppUserId?: string | null;
  expiresAt?: string | Date | null;
  actor?: AppAuditActor;
}) {
  const subjectKey = normalizeKey(input.subjectKey, "");
  if (!subjectKey) throw new Error("service_policy_subject_required");
  const record = await policyPrisma.servicePolicyApprovalRequest.create({
    data: {
      page_id: input.pageId,
      rule_id: input.ruleId ?? null,
      action_key: normalizeKey(input.actionKey, "*"),
      resource_type: normalizeKey(input.resourceType, "*"),
      subject_key: subjectKey,
      subject_label: normalizeText(input.subjectLabel),
      target_key: normalizeText(input.targetKey),
      status: "requested",
      note: normalizeText(input.note),
      context: asJson(input.context),
      requested_by_user_id: input.requestedByUserId ?? null,
      requested_by_app_user_id: input.requestedByAppUserId ?? null,
      expires_at: parseDate(input.expiresAt),
    },
  });
  await audit(input.pageId, "service_policy_approval_requested", "service_policy_approval_request", record.id, { actionKey: record.action_key, resourceType: record.resource_type, subjectKey: record.subject_key }, input.actor);
  return record;
}

export async function decideServiceApprovalRequest(input: {
  pageId: string;
  requestId: string;
  status: ServiceApprovalStatus | string;
  note?: string | null;
  decidedByUserId?: string | null;
  actor?: AppAuditActor;
}) {
  const current = await policyPrisma.servicePolicyApprovalRequest.findFirst({
    where: { id: input.requestId, page_id: input.pageId },
  });
  if (!current) throw new Error("service_policy_approval_request_not_found");
  const status = normalizeApprovalStatus(input.status);
  const record = await policyPrisma.servicePolicyApprovalRequest.update({
    where: { id: current.id },
    data: {
      status,
      note: normalizeText(input.note) ?? current.note,
      decided_by_user_id: input.decidedByUserId ?? null,
      decided_at: new Date(),
    },
  });
  await audit(input.pageId, `service_policy_approval_${status}`, "service_policy_approval_request", record.id, { subjectKey: record.subject_key }, input.actor);
  return record;
}

export async function recordServiceRiskIncident(input: {
  pageId: string;
  key: string;
  subjectKey: string;
  category: string;
  sourceType: string;
  sourceId?: string | null;
  status?: ServiceRiskStatus | string;
  score?: number | null;
  signalCount?: number | null;
  detail?: unknown;
  metadata?: unknown;
  resolvedAt?: string | Date | null;
  actor?: AppAuditActor;
}) {
  const key = normalizeKey(input.key, "incident");
  const subjectKey = normalizeKey(input.subjectKey, "");
  if (!subjectKey) throw new Error("service_risk_subject_required");
  const record = await policyPrisma.serviceRiskIncident.upsert({
    where: { page_id_key: { page_id: input.pageId, key } },
    update: {
      subject_key: subjectKey,
      category: normalizeKey(input.category, "generic"),
      source_type: normalizeKey(input.sourceType, "manual"),
      source_id: normalizeText(input.sourceId),
      status: normalizeRiskStatus(input.status),
      score: normalizeScore(input.score, 0),
      signal_count: Math.max(1, normalizePriority(input.signalCount, 1)),
      detail: asJson(input.detail),
      metadata: asJson(input.metadata),
      resolved_at: parseDate(input.resolvedAt),
    },
    create: {
      page_id: input.pageId,
      key,
      subject_key: subjectKey,
      category: normalizeKey(input.category, "generic"),
      source_type: normalizeKey(input.sourceType, "manual"),
      source_id: normalizeText(input.sourceId),
      status: normalizeRiskStatus(input.status),
      score: normalizeScore(input.score, 0),
      signal_count: Math.max(1, normalizePriority(input.signalCount, 1)),
      detail: asJson(input.detail),
      metadata: asJson(input.metadata),
      resolved_at: parseDate(input.resolvedAt),
    },
  });
  await audit(input.pageId, "service_risk_incident_recorded", "service_risk_incident", record.id, { key: record.key, subjectKey: record.subject_key, score: record.score }, input.actor);
  return record;
}

export async function upsertServiceRiskSanction(input: {
  pageId: string;
  key: string;
  subjectKey: string;
  sanctionType?: ServiceRiskSanctionType | string;
  actionKey?: string | null;
  resourceType?: string | null;
  incidentId?: string | null;
  status?: string | null;
  reason?: string | null;
  startsAt?: string | Date | null;
  expiresAt?: string | Date | null;
  releasedAt?: string | Date | null;
  metadata?: unknown;
  actor?: AppAuditActor;
}) {
  const key = normalizeKey(input.key, "sanction");
  const subjectKey = normalizeKey(input.subjectKey, "");
  if (!subjectKey) throw new Error("service_risk_subject_required");
  const record = await policyPrisma.serviceRiskSanction.upsert({
    where: { page_id_key: { page_id: input.pageId, key } },
    update: {
      incident_id: input.incidentId ?? null,
      subject_key: subjectKey,
      sanction_type: normalizeSanctionType(input.sanctionType),
      action_key: normalizeText(input.actionKey),
      resource_type: normalizeText(input.resourceType),
      status: normalizeText(input.status) ?? "active",
      reason: normalizeText(input.reason),
      starts_at: parseDate(input.startsAt) ?? new Date(),
      expires_at: parseDate(input.expiresAt),
      released_at: parseDate(input.releasedAt),
      metadata: asJson(input.metadata),
    },
    create: {
      page_id: input.pageId,
      key,
      incident_id: input.incidentId ?? null,
      subject_key: subjectKey,
      sanction_type: normalizeSanctionType(input.sanctionType),
      action_key: normalizeText(input.actionKey),
      resource_type: normalizeText(input.resourceType),
      status: normalizeText(input.status) ?? "active",
      reason: normalizeText(input.reason),
      starts_at: parseDate(input.startsAt) ?? new Date(),
      expires_at: parseDate(input.expiresAt),
      released_at: parseDate(input.releasedAt),
      metadata: asJson(input.metadata),
    },
  });
  await audit(input.pageId, "service_risk_sanction_upserted", "service_risk_sanction", record.id, { key: record.key, subjectKey: record.subject_key, sanctionType: record.sanction_type }, input.actor);
  return record;
}

export async function listServicePolicyState(pageId: string) {
  const [rules, approvalRequests, overrides, incidents, sanctions] = await Promise.all([
    policyPrisma.servicePolicyRule.findMany({ where: { page_id: pageId }, orderBy: [{ priority: "desc" }, { created_at: "desc" }] }),
    policyPrisma.servicePolicyApprovalRequest.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
    policyPrisma.servicePolicyOverride.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
    policyPrisma.serviceRiskIncident.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
    policyPrisma.serviceRiskSanction.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
  ]);
  return { rules, approvalRequests, overrides, incidents, sanctions };
}

export async function evaluateServicePolicy(input: {
  pageId: string;
  subjectKey: string;
  actionKey: string;
  resourceType: string;
  context?: Record<string, unknown>;
}) {
  const now = new Date();
  const subjectKey = normalizeKey(input.subjectKey, "");
  if (!subjectKey) throw new Error("service_policy_subject_required");
  const actionKey = normalizeKey(input.actionKey, "*");
  const resourceType = normalizeKey(input.resourceType, "*");
  const context = input.context ?? {};

  const [rules, overrides, approvals, incidents, sanctions] = await Promise.all([
    policyPrisma.servicePolicyRule.findMany({
      where: {
        page_id: input.pageId,
        enabled: true,
        action_key: { in: [actionKey, "*"] },
        resource_type: { in: [resourceType, "*"] },
      },
      orderBy: [{ priority: "desc" }, { created_at: "desc" }],
    }),
    policyPrisma.servicePolicyOverride.findMany({
      where: { page_id: input.pageId, subject_key: subjectKey, enabled: true },
      orderBy: { created_at: "desc" },
    }),
    policyPrisma.servicePolicyApprovalRequest.findMany({
      where: { page_id: input.pageId, subject_key: subjectKey, action_key: actionKey, resource_type: resourceType },
      orderBy: { updated_at: "desc" },
    }),
    policyPrisma.serviceRiskIncident.findMany({
      where: { page_id: input.pageId, subject_key: subjectKey, status: { in: ["open", "reviewing", "blocked"] } },
      orderBy: { created_at: "desc" },
    }),
    policyPrisma.serviceRiskSanction.findMany({
      where: { page_id: input.pageId, subject_key: subjectKey, status: "active" },
      orderBy: { created_at: "desc" },
    }),
  ]);

  const activeOverrides = overrides.filter((item) => matchesActionOrResource(item.action_key, actionKey) && matchesActionOrResource(item.resource_type, resourceType) && isActiveAt(now, item.created_at, item.expires_at));
  const activeSanctions = sanctions.filter((item) => matchesActionOrResource(item.action_key, actionKey) && matchesActionOrResource(item.resource_type, resourceType) && isActiveAt(now, item.starts_at, item.expires_at));
  const activeApprovals = approvals.filter((item) => isActiveAt(now, item.created_at, item.expires_at));
  const approvedRequest = activeApprovals.find((item) => item.status === "approved");
  const pendingRequest = activeApprovals.find((item) => item.status === "requested");
  const riskScore = incidents.reduce((sum, item) => sum + item.score, 0);

  const reasons: string[] = [];
  let decision: ServicePolicyEffect = "allow";

  if (activeSanctions.some((item) => item.sanction_type === "block")) {
    decision = "deny";
    reasons.push("sanction:block");
  } else if (approvedRequest) {
    decision = "allow";
    reasons.push("approval:approved");
  } else if (activeSanctions.some((item) => item.sanction_type === "review")) {
    decision = "review";
    reasons.push("sanction:review");
  } else if (activeOverrides.length) {
    decision = normalizeEffect(activeOverrides[0]?.effect);
    reasons.push(`override:${activeOverrides[0]?.key}`);
  } else {
    const matchedRules = rules.filter((item) => matchesConditions(item.conditions, context));
    const denyRule = matchedRules.find((item) => item.effect === "deny");
    const reviewRule = matchedRules.find((item) => item.effect === "review");
    const allowRule = matchedRules.find((item) => item.effect === "allow");
    if (denyRule) {
      decision = "deny";
      reasons.push(`rule:${denyRule.key}`);
    } else if (reviewRule) {
      decision = "review";
      reasons.push(`rule:${reviewRule.key}`);
    } else if (allowRule) {
      decision = "allow";
      reasons.push(`rule:${allowRule.key}`);
    }
  }

  if (decision === "allow" && pendingRequest) {
    decision = "review";
    reasons.push("approval:pending");
  }

  const evaluation = {
    decision,
    allowed: decision === "allow",
    requiresApproval: decision === "review",
    blocked: decision === "deny",
    riskScore,
    matchedRuleKeys: rules.filter((item) => matchesConditions(item.conditions, context)).map((item) => item.key),
    activeOverrideKeys: activeOverrides.map((item) => item.key),
    activeSanctionKeys: activeSanctions.map((item) => item.key),
    approvalRequestId: pendingRequest?.id ?? approvedRequest?.id ?? null,
    reasons,
  };
  return applyServicePolicyRuntimeExtensions(input.pageId, evaluation, {
    subjectKey,
    actionKey,
    resourceType,
    context,
    matchedRuleKeys: evaluation.matchedRuleKeys,
    activeOverrideKeys: evaluation.activeOverrideKeys,
    activeSanctionKeys: evaluation.activeSanctionKeys,
    approvalRequestId: evaluation.approvalRequestId,
    decision: evaluation.decision,
    riskScore: evaluation.riskScore,
  });
}
