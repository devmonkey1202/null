import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { requireUser, requireOrgMember } from "@/lib/org-access";
import { addTeamMember, listTeamMembers, removeTeamMember } from "@/lib/orgs";
import { apiErrorJson } from "@/lib/api-error";

type Params = { orgId: string; teamId: string };

const addSchema = z.object({
  orgMemberId: z.string().min(1),
});

const removeSchema = z.object({
  orgMemberId: z.string().min(1),
});

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { orgId, teamId } = await context.params;
  if (!orgId || !teamId) return apiErrorJson("bad_request", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const access = await requireOrgMember(orgId, user.id);
  if (access.error) return access.error;
  const members = await listTeamMembers(teamId);
  return NextResponse.json({ members });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { orgId, teamId } = await context.params;
  if (!orgId || !teamId) return apiErrorJson("bad_request", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const parsed = await parseJsonBody(req, addSchema);
  if (parsed.error) return parsed.error;
  const result = await addTeamMember(orgId, teamId, user.id, parsed.data.orgMemberId);
  if (!result.ok) return apiErrorJson(result.error, 403);
  return NextResponse.json({ ok: true, member: result.member });
}

export async function DELETE(req: Request, context: { params: Promise<Params> }) {
  const { orgId, teamId } = await context.params;
  if (!orgId || !teamId) return apiErrorJson("bad_request", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const parsed = await parseJsonBody(req, removeSchema);
  if (parsed.error) return parsed.error;
  const result = await removeTeamMember(orgId, teamId, user.id, parsed.data.orgMemberId);
  if (!result.ok) return apiErrorJson(result.error, 403);
  return NextResponse.json({ ok: true });
}
