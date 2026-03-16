/**
 * H1: 버전 단건 조회 — diff·미리보기용. 해당 버전의 content_json·메타 반환.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";

type Params = { pageId: string; versionId: string };

export async function GET(_req: Request, context: { params: Promise<Params> }) {
  const anonUserId = await resolveAnonUserId(_req);
  if (!anonUserId) return apiErrorJson("anon_user_id_required", 401);

  const { pageId, versionId } = await context.params;
  if (!pageId || !versionId) return apiErrorJson("bad_params", 400);

  const user = await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } });
  if (!user) return apiErrorJson("not_found", 404);

  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: user.id, is_deleted: false },
    select: { id: true },
  });
  if (!page) return apiErrorJson("not_found", 404);

  const version = await prisma.pageVersion.findFirst({
    where: { id: versionId, page_id: pageId },
    select: { id: true, created_at: true, content_json: true },
  });
  if (!version) return apiErrorJson("version_not_found", 404);

  const content = version.content_json as Record<string, unknown> | null;
  const nodesObject =
    content && typeof content === "object" && content.nodes && typeof content.nodes === "object"
      ? (content.nodes as Record<string, unknown>)
      : null;
  const nodeCount = nodesObject ? Object.keys(nodesObject).length : 0;

  const { searchParams } = new URL(_req.url);
  const includeValues = new Set(
    (searchParams.get("include") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const includeNodes = includeValues.has("nodes");
  const includeContent = includeValues.has("content");
  let nodeIds: string[] | undefined;
  let nodeIdsTruncated = false;
  if (includeNodes && nodesObject) {
    nodeIds = Object.keys(nodesObject);
    const MAX_NODE_IDS = 20000;
    if (nodeIds.length > MAX_NODE_IDS) {
      nodeIds = nodeIds.slice(0, MAX_NODE_IDS);
      nodeIdsTruncated = true;
    }
  }

  return NextResponse.json({
    ok: true,
    version: {
      id: version.id,
      created_at: version.created_at.toISOString(),
      nodeCount,
      nodeIds,
      nodeIdsTruncated: includeNodes ? nodeIdsTruncated : undefined,
      content: includeContent ? content : undefined,
    },
  });
}
