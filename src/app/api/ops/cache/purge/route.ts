import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin-session";
import { normalizeCacheTags, recordCachePurge } from "@/lib/cache-policy";

export async function POST(req: Request) {
  const gate = await requireAdminAccess(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.code }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rawTags = Array.isArray(body?.tags) ? body?.tags : [];
  const tags = normalizeCacheTags(rawTags.map((tag) => String(tag)));
  if (tags.length === 0) {
    return NextResponse.json({ ok: false, error: "tags_required" }, { status: 400 });
  }

  const reason = typeof body?.reason === "string" ? body.reason : undefined;
  const entry = recordCachePurge({ tags, reason, actor: { adminId: gate.admin.id } });

  return NextResponse.json({ ok: true, purge: entry });
}
