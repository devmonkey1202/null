import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { safeParseBody, withErrorHandler } from "@/lib/api-handler";
import { addConnector, getConnectors, removeConnector, updateConnector, validateConnectorConfig } from "@/lib/connectors";

type Params = { pageId: string };

async function requireOwner(pageId: string, req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { userId: null as null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return { userId: null as null, error: apiErrorJson("user_not_found", 404) };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { userId: null as null, error: apiErrorJson("not_found", 404) };
  return { userId: user.id, error: null };
}

export const GET = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;
  const connectors = await getConnectors(pageId);
  return NextResponse.json({ connectors });
});

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;
  const body = await safeParseBody(req);
  const parsed = validateConnectorConfig(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "connector_invalid", detail: parsed.error.format() }, { status: 400 });
  }
  const created = await addConnector(pageId, parsed.data);
  if (!created) return apiErrorJson("connector_invalid", 400);
  return NextResponse.json({ connector: created });
});

export const PATCH = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;
  const body = await safeParseBody(req);
  const parsed = validateConnectorConfig(body);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "connector_invalid", detail: parsed.success ? "id_required" : parsed.error.format() }, { status: 400 });
  }
  const updated = await updateConnector(pageId, parsed.data);
  if (!updated) return apiErrorJson("not_found", 404);
  return NextResponse.json({ connector: updated });
});

export const DELETE = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return apiErrorJson("id_required", 400);
  const connectors = await removeConnector(pageId, id);
  return NextResponse.json({ connectors });
});
