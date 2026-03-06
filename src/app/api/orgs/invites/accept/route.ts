import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { requireUser } from "@/lib/org-access";
import { acceptOrganizationInvite } from "@/lib/orgs";
import { apiErrorJson } from "@/lib/api-error";

const acceptSchema = z.object({
  orgId: z.string().min(1),
});

export async function POST(req: Request) {
  const { user, error } = await requireUser(req);
  if (error) return error;
  const parsed = await parseJsonBody(req, acceptSchema);
  if (parsed.error) return parsed.error;
  const result = await acceptOrganizationInvite(parsed.data.orgId, user.id, user.email ?? null);
  if (!result.ok) return apiErrorJson(result.error, 400);
  return NextResponse.json({ ok: true, member: result.member });
}
