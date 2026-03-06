import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";
import { requireUser } from "@/lib/org-access";
import { createOrganization, listOrganizationsForUser } from "@/lib/orgs";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80).optional().nullable(),
});

export async function GET(req: Request) {
  const { user, error } = await requireUser(req);
  if (error) return error;
  const orgs = await listOrganizationsForUser(user.id);
  return NextResponse.json({ orgs });
}

export async function POST(req: Request) {
  const { user, error } = await requireUser(req);
  if (error) return error;
  const parsed = await parseJsonBody(req, createSchema);
  if (parsed.error) return parsed.error;
  const org = await createOrganization(user.id, parsed.data.name, parsed.data.slug ?? null);
  return NextResponse.json({ ok: true, org });
}
