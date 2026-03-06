import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { requireUser, requireOrgMember } from "@/lib/org-access";
import { createTeam, listTeams } from "@/lib/orgs";
import { apiErrorJson } from "@/lib/api-error";

type Params = { orgId: string };

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80).optional().nullable(),
});

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { orgId } = await context.params;
  if (!orgId) return apiErrorJson("org_id_required", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const access = await requireOrgMember(orgId, user.id);
  if (access.error) return access.error;
  const teams = await listTeams(orgId);
  return NextResponse.json({ teams });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { orgId } = await context.params;
  if (!orgId) return apiErrorJson("org_id_required", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const parsed = await parseJsonBody(req, createSchema);
  if (parsed.error) return parsed.error;
  const result = await createTeam(orgId, user.id, parsed.data.name, parsed.data.slug ?? null);
  if (!result.ok) return apiErrorJson(result.error, 403);
  return NextResponse.json({ ok: true, team: result.team });
}
