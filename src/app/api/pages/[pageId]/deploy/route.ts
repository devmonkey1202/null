import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { expireStalePages } from "@/lib/expire";
import { apiErrorJson } from "@/lib/api-error";
import { substituteAlertTemplate } from "@/lib/alert-template";
import { parseJsonBody } from "@/lib/validation";
import { logPageAudit } from "@/lib/page-audit";

type Params = { pageId: string };

/**
 * §32 NULL 자체에서 배포·동작.
 * POST { "deploy": true } → 배포 (deployed_at 설정). NULL URL(/p/[pageId])에서 만료 없이 접근 가능.
 * POST { "deploy": false } → 배포 취소 (deployed_at = null).
 */
export async function POST(req: Request, context: { params: Promise<Params> }) {
  await expireStalePages();

  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) {
    return apiErrorJson("anon_user_id_required", 401, "로그인 또는 익명 초기화가 필요합니다.");
  }

  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);

  const parsed = await parseJsonBody(
    req,
    z
      .object({
        deploy: z.boolean().optional(),
      })
      .passthrough()
  );
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const page = await prisma.page.findUnique({
    where: { id: pageId, is_deleted: false },
    include: { owner: true },
  });

  if (!page) return apiErrorJson("not_found", 404);
  if (page.owner.anon_id !== anonUserId) {
    return apiErrorJson("forbidden", 403, "본인 작품만 배포할 수 있습니다.");
  }

  if (!page.current_version_id) {
    return apiErrorJson("no_version", 400, "저장된 버전이 없습니다. 저장 후 배포해 주세요.");
  }

  const deploy = body.deploy === true;
  const updated = await prisma.page.update({
    where: { id: pageId },
    data: { deployed_at: deploy ? new Date() : null },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const deployUrl = baseUrl ? `${baseUrl}/p/${pageId}` : `/p/${pageId}`;

  // §31.8 배포 시 Discord 알림 (webhook 설정 시, raw로 조회)
  let webhookUrl: string | null = null;
  if (deploy) {
    const webhookRows = await prisma.$queryRaw<[{ discord_webhook_url: string | null }]>`
      SELECT "discord_webhook_url" FROM "Page" WHERE "id" = ${pageId} AND "is_deleted" = false
    `;
    webhookUrl = webhookRows[0]?.discord_webhook_url?.trim() ?? null;
  }
  if (deploy && webhookUrl) {
    const title = updated.title || `익명 작품 #${updated.anon_number}`;
    const description = substituteAlertTemplate("**{title}**\n\n배포 URL: {deploy_url}", { title, deploy_url: deployUrl });
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: null,
        embeds: [
          {
            title: "작품이 배포되었습니다",
            description,
            color: 0x00c853,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    }).catch(() => {});
  }

  await logPageAudit({
    pageId,
    action: "page_deploy",
    targetType: "page",
    targetId: updated.id,
    meta: { deployed: deploy, deployed_at: updated.deployed_at?.toISOString() ?? null },
    actor: { userId: page.owner.id, anonId: anonUserId },
  });

  return NextResponse.json({
    ok: true,
    pageId: updated.id,
    deployed: deploy,
    deployed_at: updated.deployed_at,
    deploy_url: deploy ? deployUrl : null,
  });
}
