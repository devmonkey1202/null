import { NextResponse } from "next/server";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { logAppAudit } from "@/lib/app-audit";

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { page: null as null, user: null as null, anonUserId: null as string | null, error: apiErrorJson("not_found", 404) };
  return { page, user, anonUserId, error: null };
}

export const GET = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const { error } = await requireOwner(pageId, req);
    if (error) return error;
    const secrets = await prisma.appSecret.findMany({
      where: { page_id: pageId },
      select: { id: true, key: true, created_at: true, updated_at: true },
      orderBy: { key: "asc" },
    });
    return NextResponse.json({ secrets });
  }
);

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const { error, user, anonUserId } = await requireOwner(pageId, req);
    if (error) return error;
    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body || !body.key || !body.value) {
      return NextResponse.json({ error: "key_value_required" }, { status: 400 });
    }

    const key = String(body.key).trim().toUpperCase();
    const value = String(body.value);

    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      return NextResponse.json(
        { error: "key_format_invalid" },
        { status: 400 }
      );
    }

    const secret = await prisma.appSecret.upsert({
      where: { page_id_key: { page_id: pageId, key } },
      create: { page_id: pageId, key, value },
      update: { value },
    });
    await logAppAudit({
      pageId,
      action: "secret_set",
      targetType: "secret",
      targetId: secret.id,
      meta: { key },
      actor: { userId: user!.id, anonId: anonUserId! },
    });

    return NextResponse.json({
      ok: true,
      secret: { id: secret.id, key: secret.key, created_at: secret.created_at },
    });
  }
);

export const DELETE = withErrorHandler(
  async (req: Request, context: { params: Promise<{ pageId: string }> }) => {
    const { pageId } = await context.params;
    const { error, user, anonUserId } = await requireOwner(pageId, req);
    if (error) return error;
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key_param_required" }, { status: 400 });

    await prisma.appSecret.deleteMany({
      where: { page_id: pageId, key },
    });
    await logAppAudit({
      pageId,
      action: "secret_delete",
      targetType: "secret",
      targetId: key,
      meta: { key },
      actor: { userId: user!.id, anonId: anonUserId! },
    });
    return NextResponse.json({ ok: true });
  }
);
