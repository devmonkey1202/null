import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { getCollectionBySlug, validateRecordData, type AppFieldDef } from "@/lib/app-data";
import { logAppAudit } from "@/lib/app-audit";
import { ensureDevCollections, readEnvFromRequest, resolveAppEnv, toEnvSlug } from "@/lib/app-env";

type Params = { pageId: string; model: string; id: string };

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { userId: null as null, anonId: null as string | null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { userId: null as null, anonId: null as string | null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { userId: null as null, anonId: null as string | null, error: apiErrorJson("not_found", 404) };
  return { userId: user.id, anonId: anonUserId, error: null };
}

const bodySchema = z.object({
  versionId: z.string().min(1),
}).passthrough();

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId, model, id } = await context.params;
  if (!pageId || !model || !id) return apiErrorJson("bad_request", 400);

  const { error, userId, anonId } = await requireOwner(pageId, req);
  if (error) return error;

  const env = await resolveAppEnv(pageId, { isOwner: true, requestEnv: readEnvFromRequest(req) });
  if (env === "dev") {
    await ensureDevCollections(pageId);
  }
  const resolvedSlug = toEnvSlug(model, env);

  const parsed = await req.json().catch(() => null);
  const body = bodySchema.safeParse(parsed);
  if (!body.success) return apiErrorJson("invalid_body", 400);

  const version = await prisma.appRecordVersion.findFirst({
    where: { id: body.data.versionId, page_id: pageId, record_id: id, collection_slug: resolvedSlug },
  });
  if (!version) return apiErrorJson("not_found", 404);

  const coll = await getCollectionBySlug(pageId, model, env);
  if (!coll) return apiErrorJson("collection_not_found", 404);
  const fields = (coll.fields ?? []) as AppFieldDef[];
  const strict = Boolean((coll as { strict?: boolean }).strict);
  const candidate = typeof version.data === "object" && version.data !== null ? version.data : {};
  const validated = validateRecordData(fields, candidate as Record<string, unknown>, { mode: "update", strict });
  if (validated.errors.length) {
    return apiErrorJson("validation_failed", 400, { detail: validated.errors });
  }

  const existing = await prisma.appRecord.findFirst({
    where: { id, page_id: pageId, collection_slug: resolvedSlug },
  });

  const record = existing
    ? await prisma.appRecord.update({
        where: { id },
        data: { data: validated.data as object, updated_at: new Date() },
      })
    : await prisma.appRecord.create({
        data: {
          id,
          page_id: pageId,
          collection_slug: resolvedSlug,
          data: validated.data as object,
        },
      });

  await prisma.appRecordVersion.create({
    data: {
      page_id: pageId,
      record_id: record.id,
      collection_slug: resolvedSlug,
      action: "restored",
      data: record.data as object,
      actor_user_id: userId,
      actor_anon_id: anonId,
    },
  });

  await logAppAudit({
    pageId,
    action: "record_restore",
    targetType: "record",
    targetId: record.id,
    meta: { collection: model, versionId: body.data.versionId },
    actor: { userId, anonId },
  });

  return NextResponse.json({
    ok: true,
    record: {
      id: record.id,
      ...(record.data as object),
      created_at: record.created_at,
      updated_at: record.updated_at,
    },
  });
}
