import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/validation";
import { readEnvFromRequest, resolveAppEnv, setEnvironment } from "@/lib/app-env";

type Params = { pageId: string };

async function getPageAndOwner(pageId: string, req: Request) {
  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner: { select: { anon_id: true } } },
  });
  if (!page) return { page: null as null, isOwner: false };
  const anonUserId = await resolveAnonUserId(req);
  const isOwner = !!anonUserId && page.owner.anon_id === anonUserId;
  return { page, isOwner };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { page, isOwner } = await getPageAndOwner(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);

  const env = await resolveAppEnv(pageId, { isOwner, requestEnv: readEnvFromRequest(req) });
  return NextResponse.json({ ok: true, env, is_owner: isOwner });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const { page, isOwner } = await getPageAndOwner(pageId, req);
  if (!page) return apiErrorJson("not_found", 404);
  if (!isOwner) return apiErrorJson("forbidden", 403);

  const parsed = await parseJsonBody(
    req,
    z
      .object({
        mode: z.enum(["dev", "prod"]),
      })
      .passthrough()
  );
  if (parsed.error) return parsed.error;

  await setEnvironment(pageId, parsed.data.mode);
  return NextResponse.json({ ok: true, env: parsed.data.mode });
}
