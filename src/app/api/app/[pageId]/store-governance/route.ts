import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { safeParseBody, withErrorHandler } from "@/lib/api-handler";
import { getActiveOrgMember, isOrgRoleAllowed, type OrgRole } from "@/lib/org-access";
import { logPageAudit } from "@/lib/page-audit";
import {
  decideStoreApproval,
  getStoreGovernance,
  requestStoreApproval,
  setStorePolicy,
  toggleStoreSaved,
} from "@/lib/store-governance";

type Params = { pageId: string };

async function resolveActor(req: Request) {
  const anonId = await resolveAnonUserId(req);
  if (!anonId) return { userId: null as string | null, anonId: null as string | null };
  const user = await prisma.user.findUnique({ where: { anon_id: anonId }, select: { id: true } });
  return { userId: user?.id ?? null, anonId };
}

async function resolveAccess(pageId: string, req: Request) {
  const actor = await resolveActor(req);
  if (!actor.userId) return { actor, page: null as null, role: null as OrgRole | null, error: apiErrorJson("anon_required", 401) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, org_id: true },
  });
  if (!page) return { actor, page: null as null, role: null as OrgRole | null, error: apiErrorJson("not_found", 404) };
  if (page.owner_id === actor.userId) return { actor, page, role: "owner" as OrgRole, error: null };
  if (page.org_id) {
    const member = await getActiveOrgMember(page.org_id, actor.userId);
    if (member) return { actor, page, role: member.role as OrgRole, error: null };
  }
  return { actor, page, role: null as OrgRole | null, error: apiErrorJson("forbidden", 403) };
}

function requireAdmin(role: OrgRole | null) {
  return isOrgRoleAllowed(role, ["owner", "admin"]);
}

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const access = await resolveAccess(pageId, req);
  if (access.error) return access.error;
  const governance = await getStoreGovernance(pageId);
  return NextResponse.json({ ok: true, governance, role: access.role, orgId: access.page?.org_id ?? null });
});

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const access = await resolveAccess(pageId, req);
  if (access.error) return access.error;
  const body = (await safeParseBody(req)) as Record<string, unknown> | null;
  if (!body) return apiErrorJson("body_required", 400);
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "toggle_saved") {
    const type = body.type === "widget" ? "widget" : "plugin";
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    if (!storeId) return apiErrorJson("store_id_required", 400);
    const current = await getStoreGovernance(pageId);
    if (!current.policy.allowSave) return apiErrorJson("store_save_disabled", 403);
    const governance = await toggleStoreSaved(pageId, type, storeId, access.actor.userId);
    await logPageAudit({
      pageId,
      action: "store_saved_toggle",
      targetType: type,
      targetId: storeId,
      meta: { scope: governance.policy.scope },
      actor: { userId: access.actor.userId, anonId: access.actor.anonId },
    });
    return NextResponse.json({ ok: true, governance });
  }

  if (action === "request_approval") {
    const type = body.type === "widget" ? "widget" : "plugin";
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    const note = typeof body.note === "string" ? body.note : null;
    if (!storeId) return apiErrorJson("store_id_required", 400);
    const governance = await requestStoreApproval(pageId, type, storeId, access.actor.userId, note);
    await logPageAudit({
      pageId,
      action: "store_approval_requested",
      targetType: type,
      targetId: storeId,
      meta: note ? { note } : null,
      actor: { userId: access.actor.userId, anonId: access.actor.anonId },
    });
    return NextResponse.json({ ok: true, governance });
  }

  if (action === "decide_approval") {
    if (!requireAdmin(access.role)) return apiErrorJson("org_admin_required", 403);
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const status = body.status === "rejected" ? "rejected" : body.status === "approved" ? "approved" : null;
    const note = typeof body.note === "string" ? body.note : null;
    if (!requestId || !status) return apiErrorJson("request_invalid", 400);
    const governance = await decideStoreApproval(pageId, requestId, status, access.actor.userId, note);
    await logPageAudit({
      pageId,
      action: `store_approval_${status}`,
      targetType: "store_request",
      targetId: requestId,
      meta: note ? { note } : null,
      actor: { userId: access.actor.userId, anonId: access.actor.anonId },
    });
    return NextResponse.json({ ok: true, governance });
  }

  return apiErrorJson("action_invalid", 400);
});

export const PATCH = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const access = await resolveAccess(pageId, req);
  if (access.error) return access.error;
  if (!requireAdmin(access.role)) return apiErrorJson("org_admin_required", 403);
  const body = (await safeParseBody(req)) as Record<string, unknown> | null;
  if (!body) return apiErrorJson("body_required", 400);
  const governance = await setStorePolicy(
    pageId,
    {
      scope: body.scope === "org" ? "org" : body.scope === "page" ? "page" : undefined,
      pluginApprovalRequired: typeof body.pluginApprovalRequired === "boolean" ? body.pluginApprovalRequired : undefined,
      widgetApprovalRequired: typeof body.widgetApprovalRequired === "boolean" ? body.widgetApprovalRequired : undefined,
      allowSave: typeof body.allowSave === "boolean" ? body.allowSave : undefined,
      allowedPermissions: Array.isArray(body.allowedPermissions)
        ? body.allowedPermissions.filter((value): value is string => typeof value === "string")
        : undefined,
    },
    access.actor.userId,
  );
  await logPageAudit({
    pageId,
    action: "store_policy_updated",
    targetType: "store_policy",
    targetId: access.page?.org_id ?? pageId,
    meta: { scope: governance.policy.scope, allowedPermissions: governance.policy.allowedPermissions },
    actor: { userId: access.actor.userId, anonId: access.actor.anonId },
  });
  return NextResponse.json({ ok: true, governance });
});
