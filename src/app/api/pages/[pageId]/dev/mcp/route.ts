import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { buildDevMcpDescriptor, hydrateExternalDevDoc, runDevMcpTool, type DevMcpToolName } from "@/lib/dev-external";

type Params = { pageId: string };

async function requireOwnerPage(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { error: apiErrorJson("anon_user_id_required", 401), page: null as null };

  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: {
      id: true,
      owner: { select: { anon_id: true } },
      current_version: { select: { content_json: true } },
    },
  });
  if (!page) return { error: apiErrorJson("not_found", 404), page: null as null };
  if (page.owner.anon_id !== anonUserId) return { error: apiErrorJson("forbidden", 403), page: null as null };
  return { error: null, page };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  const access = await requireOwnerPage(pageId, req);
  if (access.error || !access.page) return access.error;
  return NextResponse.json({
    ok: true,
    ...buildDevMcpDescriptor(),
    pageId,
  });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  const access = await requireOwnerPage(pageId, req);
  if (access.error || !access.page) return access.error;

  const doc = hydrateExternalDevDoc(access.page.current_version?.content_json);
  if (!doc) return apiErrorJson("version_not_found", 404);

  const body = (await req.json().catch(() => null)) as { tool?: unknown; args?: unknown } | null;
  const tool = typeof body?.tool === "string" ? (body.tool as DevMcpToolName) : null;
  if (!tool) return apiErrorJson("tool_required", 400);

  const result = runDevMcpTool(
    doc,
    pageId,
    tool,
    body?.args && typeof body.args === "object" ? (body.args as Record<string, unknown>) : undefined,
  );
  if (result == null) return apiErrorJson("tool_result_not_found", 404);

  return NextResponse.json({
    ok: true,
    tool,
    result,
  });
}
