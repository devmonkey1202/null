import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { requireUser, requireOrgMember } from "@/lib/org-access";
import { assignPageToOrg, listOrgPages } from "@/lib/orgs";
import { apiErrorJson } from "@/lib/api-error";

type Params = { orgId: string };

const assignSchema = z.object({
  pageId: z.string().min(1),
});

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { orgId } = await context.params;
  if (!orgId) return apiErrorJson("org_id_required", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const access = await requireOrgMember(orgId, user.id);
  if (access.error) return access.error;
  const pages = await listOrgPages(orgId);
  return NextResponse.json({ pages });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { orgId } = await context.params;
  if (!orgId) return apiErrorJson("org_id_required", 400);
  const { user, error } = await requireUser(req);
  if (error) return error;
  const parsed = await parseJsonBody(req, assignSchema);
  if (parsed.error) return parsed.error;
  const result = await assignPageToOrg(orgId, user.id, parsed.data.pageId);
  if (!result.ok) return apiErrorJson(result.error, 403);
  return NextResponse.json({ ok: true, page: result.page });
}
