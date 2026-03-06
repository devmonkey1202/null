import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { withErrorHandler, safeParseBody } from "@/lib/api-handler";
import { addPlugins, getPlugins, removePlugin, setPlugins, type PluginManifest } from "@/lib/app-plugins";
import { logAppAudit } from "@/lib/app-audit";

type Params = { pageId: string };

async function getPageAndOwner(pageId: string, req: Request) {
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner: { select: { anon_id: true } }, status: true, is_hidden: true },
  });
  if (!page) return { page: null as null, isOwner: false };
  const anonUserId = await resolveAnonUserId(req);
  const isOwner = !!anonUserId && page.owner.anon_id === anonUserId;
  return { page, isOwner };
}

async function resolveActor(req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { userId: null as string | null, anonId: null as string | null };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  return { userId: user?.id ?? null, anonId: anonUserId };
}

export const GET = withErrorHandler(
  async (req: Request, context: { params: Promise<Params> }) => {
    const { pageId } = await context.params;
    if (!pageId) return apiErrorJson("bad_page_id", 400);

    const { page, isOwner } = await getPageAndOwner(pageId, req);
    if (!page) return apiErrorJson("not_found", 404);
    if (!isOwner) {
      if (page.is_hidden || page.status !== "live") return apiErrorJson("not_found", 404);
    }

    const plugins = await getPlugins(pageId);
    return NextResponse.json({ plugins });
  }
);

export const POST = withErrorHandler(
  async (req: Request, context: { params: Promise<Params> }) => {
    const { pageId } = await context.params;
    if (!pageId) return apiErrorJson("bad_page_id", 400);

    const { page, isOwner } = await getPageAndOwner(pageId, req);
    if (!page) return apiErrorJson("not_found", 404);
    if (!isOwner) return apiErrorJson("forbidden", 403);

    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body) return apiErrorJson("body_required", 400);

    const pluginsRaw = Array.isArray(body.plugins)
      ? (body.plugins as PluginManifest[])
      : body.plugin
        ? [body.plugin as PluginManifest]
        : [];

    if (!pluginsRaw.length) return apiErrorJson("plugins_required", 400);

    const plugins = await addPlugins(pageId, pluginsRaw);
    const actor = await resolveActor(req);
    await logAppAudit({
      pageId,
      action: "plugin_add",
      targetType: "plugin",
      targetId: pluginsRaw[0]?.id ?? null,
      meta: { count: pluginsRaw.length },
      actor: { userId: actor.userId, anonId: actor.anonId },
    });
    return NextResponse.json({ ok: true, plugins });
  }
);

export const PUT = withErrorHandler(
  async (req: Request, context: { params: Promise<Params> }) => {
    const { pageId } = await context.params;
    if (!pageId) return apiErrorJson("bad_page_id", 400);

    const { page, isOwner } = await getPageAndOwner(pageId, req);
    if (!page) return apiErrorJson("not_found", 404);
    if (!isOwner) return apiErrorJson("forbidden", 403);

    const body = (await safeParseBody(req)) as Record<string, unknown> | null;
    if (!body) return apiErrorJson("body_required", 400);

    const pluginsRaw = Array.isArray(body.plugins) ? (body.plugins as PluginManifest[]) : [];
    const plugins = await setPlugins(pageId, pluginsRaw);
    const actor = await resolveActor(req);
    await logAppAudit({
      pageId,
      action: "plugin_set",
      targetType: "plugin",
      targetId: null,
      meta: { count: pluginsRaw.length },
      actor: { userId: actor.userId, anonId: actor.anonId },
    });
    return NextResponse.json({ ok: true, plugins });
  }
);

export const DELETE = withErrorHandler(
  async (req: Request, context: { params: Promise<Params> }) => {
    const { pageId } = await context.params;
    if (!pageId) return apiErrorJson("bad_page_id", 400);

    const { page, isOwner } = await getPageAndOwner(pageId, req);
    if (!page) return apiErrorJson("not_found", 404);
    if (!isOwner) return apiErrorJson("forbidden", 403);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return apiErrorJson("id_required", 400);

    const plugins = await removePlugin(pageId, id);
    const actor = await resolveActor(req);
    await logAppAudit({
      pageId,
      action: "plugin_remove",
      targetType: "plugin",
      targetId: id,
      meta: null,
      actor: { userId: actor.userId, anonId: actor.anonId },
    });
    return NextResponse.json({ ok: true, plugins });
  }
);
