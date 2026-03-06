import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { requireUser } from "@/lib/org-access";
import { removeOrganizationMember, updateOrganizationMemberRole } from "@/lib/orgs";
import { apiErrorJson } from "@/lib/api-error";

type Params = { orgId: string; memberId: string };

const updateSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
});

export async function PATCH(req: Request, context: { params: Promise<Params> }) {
  const { orgId, memberId } = await context.params;
  if (!orgId || !memberId) return apiErrorJson("bad_request", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const parsed = await parseJsonBody(req, updateSchema);
  if (parsed.error) return parsed.error;
  if (!parsed.data.role) return apiErrorJson("role_required", 400);
  const result = await updateOrganizationMemberRole(orgId, user.id, memberId, parsed.data.role);
  if (!result.ok) return apiErrorJson(result.error, 403);
  return NextResponse.json({ ok: true, member: result.member });
}

export async function DELETE(req: Request, context: { params: Promise<Params> }) {
  const { orgId, memberId } = await context.params;
  if (!orgId || !memberId) return apiErrorJson("bad_request", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const result = await removeOrganizationMember(orgId, user.id, memberId);
  if (!result.ok) return apiErrorJson(result.error, 403);
  return NextResponse.json({ ok: true, member: result.member });
}
