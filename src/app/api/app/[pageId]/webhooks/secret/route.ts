import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { logAppAudit } from "@/lib/app-audit";

type Params = { pageId: string };

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { page: null as null, userId: null as null, anonUserId: null as string | null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { page: null as null, userId: null as null, anonUserId: null as string | null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { page: null as null, userId: null as null, anonUserId: null as string | null, error: apiErrorJson("not_found", 404) };
  return { page, userId: user.id, anonUserId, error: null };
}

async function loadSecret(pageId: string) {
  const row = await prisma.pageSetting.findUnique({
    where: { page_id_key: { page_id: pageId, key: "webhook_secret" } },
    select: { value: true, updated_at: true },
  });
  const secret = typeof row?.value === "string" ? row.value : null;
  return { secret, updatedAt: row?.updated_at?.toISOString() ?? null };
}

function fingerprint(secret: string) {
  return createHash("sha256").update(secret).digest("hex").slice(0, 8);
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;

  const { secret, updatedAt } = await loadSecret(pageId);
  if (!secret) return NextResponse.json({ secret: null, updatedAt: null });
  return NextResponse.json({ secret, fingerprint: fingerprint(secret), updatedAt });
}

export async function PUT(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, userId, anonUserId } = await requireOwner(pageId, req);
  if (error) return error;

  const parsed = await parseJsonBody(
    req,
    z.object({
      secret: z.string().min(12).max(200).optional(),
      rotate: z.boolean().optional(),
    }).passthrough()
  );
  if (parsed.error) return parsed.error;

  const secret = parsed.data.secret
    ? parsed.data.secret
    : parsed.data.rotate
      ? randomBytes(32).toString("hex")
      : randomBytes(32).toString("hex");

  await prisma.pageSetting.upsert({
    where: { page_id_key: { page_id: pageId, key: "webhook_secret" } },
    create: { page_id: pageId, key: "webhook_secret", value: secret },
    update: { value: secret },
  });

  await logAppAudit({
    pageId,
    action: "webhook_secret_set",
    targetType: "webhook_secret",
    targetId: fingerprint(secret),
    meta: { rotated: Boolean(parsed.data.rotate) },
    actor: { userId: userId!, anonId: anonUserId! },
  });

  return NextResponse.json({ ok: true, secret, fingerprint: fingerprint(secret) });
}

export async function DELETE(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error, userId, anonUserId } = await requireOwner(pageId, req);
  if (error) return error;

  await prisma.pageSetting.delete({
    where: { page_id_key: { page_id: pageId, key: "webhook_secret" } },
  }).catch(() => null);
  await logAppAudit({
    pageId,
    action: "webhook_secret_delete",
    targetType: "webhook_secret",
    targetId: null,
    meta: null,
    actor: { userId: userId!, anonId: anonUserId! },
  });
  return NextResponse.json({ ok: true });
}
