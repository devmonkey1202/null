import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { requireUser, requireOrgMember } from "@/lib/org-access";
import { inviteOrganizationMember, listOrganizationMembers } from "@/lib/orgs";
import { apiErrorJson } from "@/lib/api-error";

type Params = { orgId: string };

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
});

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { orgId } = await context.params;
  if (!orgId) return apiErrorJson("org_id_required", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const access = await requireOrgMember(orgId, user.id);
  if (access.error) return access.error;
  const members = await listOrganizationMembers(orgId);
  return NextResponse.json({ members });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { orgId } = await context.params;
  if (!orgId) return apiErrorJson("org_id_required", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const parsed = await parseJsonBody(req, inviteSchema);
  if (parsed.error) return parsed.error;
  const result = await inviteOrganizationMember(orgId, user.id, parsed.data.email, parsed.data.role ?? "member");
  if (!result.ok) return apiErrorJson(result.error, 403);
  return NextResponse.json({ ok: true, member: result.member });
}
