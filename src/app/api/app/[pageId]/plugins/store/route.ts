import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";
import { safeParseBody, withErrorHandler } from "@/lib/api-handler";
import { addPlugins, grantPluginPermissions } from "@/lib/app-plugins";
import { getStorePlugin, toManifest } from "@/lib/plugin-store";
import { getStoreGovernance } from "@/lib/store-governance";
import { getStorePluginGovernanceState } from "@/lib/store-governance-rules";

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

export const POST = withErrorHandler(async (req: Request, context: { params: Promise<Params> }) => {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_page_id", 400);
  const { error } = await requireOwner(pageId, req);
  if (error) return error;
  const body = await safeParseBody(req);
  const storeId = typeof (body as { storeId?: string })?.storeId === "string" ? (body as { storeId: string }).storeId : "";
  const consent = (body as { consent?: boolean })?.consent === true;
  if (!storeId) return apiErrorJson("store_id_required", 400);
  const storePlugin = getStorePlugin(storeId);
  if (!storePlugin) return apiErrorJson("store_plugin_not_found", 404);
  const governance = await getStoreGovernance(pageId);
  const governanceState = getStorePluginGovernanceState(storePlugin, governance.policy, governance.requests);
  if (governanceState.blockedPermissions.length) {
    return apiErrorJson("store_permission_blocked", 403, {
      message: `blocked permissions: ${governanceState.blockedPermissions.join(", ")}`,
      extra: { blocked_permissions: governanceState.blockedPermissions },
    });
  }
  if (!governanceState.canInstall) {
    return apiErrorJson("store_approval_required", 403);
  }
  const manifest = toManifest(storePlugin);
  const needsConsent = (manifest.permissions?.length ?? 0) > 0;
  if (needsConsent && !consent) return apiErrorJson("permission_consent_required", 400);
  const plugins = await addPlugins(pageId, [manifest]);
  if (consent) {
    await grantPluginPermissions(pageId, manifest);
  }
  return NextResponse.json({ ok: true, plugins });
});
