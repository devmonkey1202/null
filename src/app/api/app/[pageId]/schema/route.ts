import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { getCollections, setSchema, type AppCollectionDef, type SchemaMode, type AppSchemaMigrations } from "@/lib/app-data";
import { logAppAudit } from "@/lib/app-audit";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";

type Params = { pageId: string };

async function getPageAndOwner(pageId: string, req: Request) {
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, owner: { select: { anon_id: true } }, status: true, is_hidden: true },
  });
  if (!page) return { page: null as null, isOwner: false };
  const anonUserId = await resolveAnonUserId(req);
  const isOwner = !!anonUserId && page.owner.anon_id === anonUserId;
  return { page, isOwner };
}

/** GET: 해당 작품의 데이터 모델(컬렉션) 목록 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { page, isOwner } = await getPageAndOwner(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);
  if (!isOwner) {
    if (page.is_hidden || page.status !== "live") return apiErrorJson("not_found", 404);
  }

  const collections = await getCollections(pageId);
  return NextResponse.json({ collections });
}

/** PUT: 해당 작품의 데이터 모델 전체 교체 (소유자만) */
export async function PUT(req: Request, context: { params: Promise<Params> }) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return apiErrorJson("anon_required", 401);

  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("user_not_found", 404);

  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return apiErrorJson("not_found", 404);

  const parsed = await parseJsonBody(
    req,
    z.object({
      collections: z.array(z.unknown()).optional(),
      mode: z.enum(["preserve", "prune"]).optional(),
      migrations: z
        .object({
          renameFields: z.record(z.record(z.string())).optional(),
          deleteFields: z.record(z.array(z.string())).optional(),
          defaults: z.record(z.record(z.unknown())).optional(),
        })
        .optional(),
      batchSize: z.number().int().min(20).max(1000).optional(),
    }).passthrough()
  );
  if (parsed.error) return parsed.error;
  const collections = Array.isArray(parsed.data.collections)
    ? (parsed.data.collections as AppCollectionDef[])
    : [];
  const mode = parsed.data.mode as SchemaMode | undefined;
  const migrations = parsed.data.migrations as AppSchemaMigrations | undefined;
  const batchSize = parsed.data.batchSize as number | undefined;
  await setSchema(pageId, collections, { mode, migrations, batchSize });
  await logAppAudit({
    pageId,
    action: "schema_update",
    targetType: "schema",
    targetId: pageId,
    meta: {
      collections: collections.map((c) => c.slug),
      mode: mode ?? "preserve",
      migrations: Boolean(migrations),
    },
    actor: { userId: user.id, anonId: anonUserId },
  });
  const list = await getCollections(pageId);
  return NextResponse.json({ ok: true, collections: list });
}
