import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { expireStalePages } from "@/lib/expire";
import { apiErrorJson } from "@/lib/api-error";
import { getCollabInviteFromRequest, isCollabInviteValid } from "@/lib/collab";
import { getProdVersionMeta, readEnvFromRequest, resolveAppEnv } from "@/lib/app-env";

type Params = { pageId: string };

export async function GET(req: Request, context: { params: Promise<Params> }) {
  await expireStalePages();

  const { pageId } = await context.params;

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      current_version: true,
      owner: true,
    },
  });

  if (!page || page.is_deleted) {
    return apiErrorJson("not_found", 404);
  }

  const anonUserId = await resolveAnonUserId(req);
  const isOwner = anonUserId && page.owner.anon_id === anonUserId;
  const collabInvite = getCollabInviteFromRequest(req);
  const allowCollabInvite = isCollabInviteValid(collabInvite, {
    collab_invite_code: page.collab_invite_code ?? null,
    collab_invite_enabled: page.collab_invite_enabled ?? false,
  });
  const now = new Date();
  const isLive = page.status === "live" && page.live_expires_at && page.live_expires_at > now;
  const isDeployed = page.deployed_at != null;

  if (!isOwner) {
    if (page.is_hidden) return apiErrorJson("not_found", 404);
    if (!allowCollabInvite) {
      if (!isLive && !isDeployed) return apiErrorJson("not_found", 404);
    }
  }

  const isEditor = Boolean(isOwner || allowCollabInvite);
  const env = await resolveAppEnv(pageId, {
    isOwner: isEditor,
    allowCollab: allowCollabInvite,
    requestEnv: readEnvFromRequest(req),
  });

  const prodMeta = await getProdVersionMeta(pageId);
  const prodVersionId = prodMeta?.versionId ?? null;

  let selectedVersion = page.current_version;
  let versionSource: "dev" | "prod" | "prod_fallback" | "none" = "none";

  if (env === "prod") {
    if (prodVersionId) {
      if (page.current_version_id === prodVersionId && page.current_version) {
        selectedVersion = page.current_version;
      } else {
        selectedVersion = await prisma.pageVersion.findUnique({ where: { id: prodVersionId } });
      }
      versionSource = "prod";
    } else if (isLive && page.current_version) {
      // Live public pages may not have a deployed prod snapshot yet.
      selectedVersion = page.current_version;
      versionSource = "prod_fallback";
    } else if (isEditor) {
      selectedVersion = page.current_version;
      versionSource = selectedVersion ? "prod_fallback" : "none";
    } else {
      return apiErrorJson("not_found", 404);
    }
  } else {
    selectedVersion = page.current_version;
    versionSource = selectedVersion ? "dev" : "none";
  }

  return NextResponse.json({
    page: {
      id: page.id,
      owner_id: page.owner_id,
      title: page.title,
      anon_number: page.anon_number,
      status: page.status,
      live_started_at: page.live_started_at,
      live_expires_at: page.live_expires_at,
      deployed_at: page.deployed_at,
      snapshot_thumbnail: page.snapshot_thumbnail,
      constraints_version: page.constraints_version,
      total_visits: page.total_visits,
      total_clicks: page.total_clicks,
      avg_duration_ms: page.avg_duration_ms,
      bounce_rate: page.bounce_rate,
      created_at: page.created_at,
      updated_at: page.updated_at,
    },
    version: selectedVersion
      ? {
          id: selectedVersion.id,
          page_id: selectedVersion.page_id,
          content_json: selectedVersion.content_json,
          created_at: selectedVersion.created_at,
        }
      : null,
    owner: isOwner ? { anon_id: page.owner.anon_id } : null,
    env,
    version_source: versionSource,
    prod_version_id: isEditor ? prodVersionId : null,
  });
}
