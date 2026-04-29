import type { AppAuditActor } from "@/lib/app-audit";
import type { AppUserPublic } from "@/lib/app-auth";
import type { AppAction, AppRole } from "@/lib/app-permissions";
import type { AppEnv } from "@/lib/app-env";

import { resolveAnonUserId } from "@/lib/anon";
import { resolveAppUserFromRequest } from "@/lib/app-request";
import { apiErrorJson } from "@/lib/api-error";
import { isAppActionAllowedWithContext, normalizeAppRole } from "@/lib/app-permissions";
import { readEnvFromRequest, resolveAppEnv } from "@/lib/app-env";
import { prisma } from "@/lib/db";
import { canAccessPublishedPage } from "@/lib/page-access";

type ServiceRoutePage = {
  id: string;
  owner_id: string;
  status: string;
  is_hidden: boolean;
  live_expires_at: Date | null;
  deployed_at: Date | null;
};

export type ServiceRouteAccess = {
  page: ServiceRoutePage;
  anonUserId: string | null;
  userId: string | null;
  isOwner: boolean;
  appUser: AppUserPublic | null;
  env: AppEnv;
  actor: AppAuditActor;
};

type ResolveResult =
  | { access: ServiceRouteAccess; error?: never }
  | { access?: never; error: Response };

type PermissionOptions = {
  ownerOnly?: boolean;
  allowAnonymous?: boolean;
  appAction?: AppAction;
  allowedRoles?: AppRole[];
  detail?: string;
};

export async function resolveServiceRouteAccess(req: Request, pageId: string): Promise<ResolveResult> {
  const [page, anonUserId, appUser] = await Promise.all([
    prisma.page.findUnique({
      where: { id: pageId, is_deleted: false },
      select: {
        id: true,
        owner_id: true,
        status: true,
        is_hidden: true,
        live_expires_at: true,
        deployed_at: true,
      },
    }),
    resolveAnonUserId(req),
    resolveAppUserFromRequest(pageId, req),
  ]);

  if (!page) return { error: apiErrorJson("not_found", 404) };

  const owner =
    anonUserId != null
      ? await prisma.user.findUnique({ where: { anon_id: anonUserId }, select: { id: true } })
      : null;
  const userId = owner?.id ?? null;
  const isOwner = userId != null && userId === page.owner_id;

  if (!canAccessPublishedPage(page, isOwner)) {
    return { error: apiErrorJson("not_found", 404) };
  }

  const env = await resolveAppEnv(pageId, {
    isOwner,
    requestEnv: readEnvFromRequest(req),
  });

  return {
    access: {
      page,
      anonUserId,
      userId,
      isOwner,
      appUser,
      env,
      actor: {
        userId,
        appUserId: appUser?.id ?? null,
        anonId: anonUserId,
      },
    },
  };
}

export function ensureServiceRoutePermission(
  access: ServiceRouteAccess,
  options: PermissionOptions = {},
): Response | null {
  if (options.ownerOnly) {
    return access.isOwner ? null : apiErrorJson("owner_required", 403);
  }

  if (access.isOwner) return null;

  if (!access.appUser) {
    return options.allowAnonymous ? null : apiErrorJson("auth_required", 401);
  }

  if (
    options.allowedRoles?.length &&
    !options.allowedRoles.includes(normalizeAppRole(access.appUser.role))
  ) {
    return apiErrorJson("permission_denied", 403, {
      detail: options.detail ?? "app_user_role_required",
    });
  }

  if (
    options.appAction &&
    !isAppActionAllowedWithContext(access.appUser.role, options.appAction, {
      isOwner: access.isOwner,
      appUserId: access.appUser.id,
    })
  ) {
    return apiErrorJson("permission_denied", 403, {
      detail: options.detail ?? "app_user_permission_required",
    });
  }

  return null;
}
