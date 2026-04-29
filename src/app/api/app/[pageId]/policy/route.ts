import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import type { AppRole } from "@/lib/app-permissions";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { parseJsonObject } from "@/lib/validation";
import {
  createServiceApprovalRequest,
  decideServiceApprovalRequest,
  evaluateServicePolicy,
  listServicePolicyState,
  recordServiceRiskIncident,
  upsertServicePolicyOverride,
  upsertServicePolicyRule,
  upsertServiceRiskSanction,
} from "@/lib/service-policy";

type Params = { pageId: string };
const OPERATOR_ROLES: AppRole[] = ["admin", "editor"];

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function permissionForAction(action: string) {
  if (action === "approval.request") {
    return { appAction: "create" as const };
  }

  if (action === "evaluate") {
    return { allowAnonymous: true } as const;
  }

  if (
    action === "rule.upsert" ||
    action === "override.upsert" ||
    action === "approval.decide" ||
    action === "risk.record" ||
    action === "sanction.upsert"
  ) {
    return { allowedRoles: OPERATOR_ROLES } as const;
  }

  return { allowedRoles: OPERATOR_ROLES } as const;
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { allowedRoles: OPERATOR_ROLES });
  if (permissionError) return permissionError;

  const state = await listServicePolicyState(pageId);
  return NextResponse.json({ ok: true, ...state });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const action = asString(body.action) ?? "";
  const permissionError = ensureServiceRoutePermission(gate.access, permissionForAction(action));
  if (permissionError) return permissionError;
  const actor = gate.access.actor;

  try {
    if (action === "rule.upsert") {
      const rule = await upsertServicePolicyRule({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        effect: asString(body.effect),
        actionKey: asString(body.actionKey) ?? asString(body.action_key) ?? null,
        resourceType: asString(body.resourceType) ?? asString(body.resource_type) ?? null,
        priority: Number(body.priority ?? 100),
        enabled: typeof body.enabled === "boolean" ? body.enabled : true,
        conditions: body.conditions,
        metadata: body.metadata,
        actor,
      });
      return NextResponse.json({ ok: true, rule });
    }

    if (action === "override.upsert") {
      const override = await upsertServicePolicyOverride({
        pageId,
        key: asString(body.key) ?? "",
        subjectKey: asString(body.subjectKey) ?? asString(body.subject_key) ?? "",
        effect: asString(body.effect) ?? "allow",
        actionKey: asString(body.actionKey) ?? asString(body.action_key) ?? null,
        resourceType: asString(body.resourceType) ?? asString(body.resource_type) ?? null,
        ruleId: asString(body.ruleId) ?? asString(body.rule_id) ?? null,
        reason: asString(body.reason) ?? null,
        enabled: typeof body.enabled === "boolean" ? body.enabled : true,
        expiresAt: asString(body.expiresAt) ?? asString(body.expires_at) ?? null,
        metadata: body.metadata,
        actor,
      });
      return NextResponse.json({ ok: true, override });
    }

    if (action === "approval.request") {
      const approvalRequest = await createServiceApprovalRequest({
        pageId,
        actionKey: asString(body.actionKey) ?? asString(body.action_key) ?? "*",
        resourceType: asString(body.resourceType) ?? asString(body.resource_type) ?? "*",
        subjectKey: asString(body.subjectKey) ?? asString(body.subject_key) ?? "",
        subjectLabel: asString(body.subjectLabel) ?? asString(body.subject_label) ?? null,
        targetKey: asString(body.targetKey) ?? asString(body.target_key) ?? null,
        ruleId: asString(body.ruleId) ?? asString(body.rule_id) ?? null,
        note: asString(body.note) ?? null,
        context: body.context,
        requestedByUserId: gate.access.userId,
        requestedByAppUserId:
          asString(body.requestedByAppUserId) ??
          asString(body.requested_by_app_user_id) ??
          gate.access.appUser?.id ??
          null,
        expiresAt: asString(body.expiresAt) ?? asString(body.expires_at) ?? null,
        actor,
      });
      return NextResponse.json({ ok: true, approvalRequest });
    }

    if (action === "approval.decide") {
      const approvalRequest = await decideServiceApprovalRequest({
        pageId,
        requestId: asString(body.requestId) ?? asString(body.request_id) ?? "",
        status: asString(body.status) ?? "requested",
        note: asString(body.note) ?? null,
        decidedByUserId: gate.access.userId,
        actor,
      });
      return NextResponse.json({ ok: true, approvalRequest });
    }

    if (action === "risk.record") {
      const incident = await recordServiceRiskIncident({
        pageId,
        key: asString(body.key) ?? "",
        subjectKey: asString(body.subjectKey) ?? asString(body.subject_key) ?? "",
        category: asString(body.category) ?? "generic",
        sourceType: asString(body.sourceType) ?? asString(body.source_type) ?? "manual",
        sourceId: asString(body.sourceId) ?? asString(body.source_id) ?? null,
        status: asString(body.status) ?? "open",
        score: Number(body.score ?? 0),
        signalCount: Number(body.signalCount ?? body.signal_count ?? 1),
        detail: body.detail,
        metadata: body.metadata,
        resolvedAt: asString(body.resolvedAt) ?? asString(body.resolved_at) ?? null,
        actor,
      });
      return NextResponse.json({ ok: true, incident });
    }

    if (action === "sanction.upsert") {
      const sanction = await upsertServiceRiskSanction({
        pageId,
        key: asString(body.key) ?? "",
        subjectKey: asString(body.subjectKey) ?? asString(body.subject_key) ?? "",
        sanctionType: asString(body.sanctionType) ?? asString(body.sanction_type) ?? "block",
        actionKey: asString(body.actionKey) ?? asString(body.action_key) ?? null,
        resourceType: asString(body.resourceType) ?? asString(body.resource_type) ?? null,
        incidentId: asString(body.incidentId) ?? asString(body.incident_id) ?? null,
        status: asString(body.status) ?? "active",
        reason: asString(body.reason) ?? null,
        startsAt: asString(body.startsAt) ?? asString(body.starts_at) ?? null,
        expiresAt: asString(body.expiresAt) ?? asString(body.expires_at) ?? null,
        releasedAt: asString(body.releasedAt) ?? asString(body.released_at) ?? null,
        metadata: body.metadata,
        actor,
      });
      return NextResponse.json({ ok: true, sanction });
    }

    if (action === "evaluate") {
      const evaluation = await evaluateServicePolicy({
        pageId,
        subjectKey: asString(body.subjectKey) ?? asString(body.subject_key) ?? "",
        actionKey: asString(body.actionKey) ?? asString(body.action_key) ?? "*",
        resourceType: asString(body.resourceType) ?? asString(body.resource_type) ?? "*",
        context: body.context && typeof body.context === "object" && !Array.isArray(body.context) ? (body.context as Record<string, unknown>) : {},
      });
      return NextResponse.json({ ok: true, evaluation });
    }

    return apiErrorJson("invalid_action", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "service_policy_failed";
    return apiErrorJson(code, 400);
  }
}
