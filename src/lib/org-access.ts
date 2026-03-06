import { prisma } from "@/lib/db";
import { resolveAnonUserId } from "@/lib/anon";
import { apiErrorJson } from "@/lib/api-error";

export type OrgRole = "owner" | "admin" | "member" | "viewer";
export type OrgStatus = "invited" | "active" | "removed";

const ADMIN_ROLES: OrgRole[] = ["owner", "admin"];

export function isOrgRoleAllowed(role: OrgRole | null | undefined, allowed: OrgRole[]) {
  if (!role) return false;
  return allowed.includes(role);
}

export async function requireUser(req: Request) {
  const anonUserId = await resolveAnonUserId(req);
  if (!anonUserId) return { user: null as null, error: apiErrorJson("anon_required", 401) };
  const user = await prisma.user.findUnique({
    where: { anon_id: anonUserId },
    select: { id: true, email: true },
  });
  if (!user) return { user: null as null, error: apiErrorJson("user_not_found", 404) };
  return { user, error: null };
}

export async function getActiveOrgMember(orgId: string, userId: string) {
  return prisma.organizationMember.findFirst({
    where: { org_id: orgId, user_id: userId, status: "active" },
    select: { id: true, role: true, status: true, org_id: true, user_id: true, email: true },
  });
}

export async function requireOrgMember(orgId: string, userId: string) {
  const member = await getActiveOrgMember(orgId, userId);
  if (!member) return { member: null as null, error: apiErrorJson("org_access_denied", 403) };
  return { member, error: null };
}

export async function requireOrgAdmin(orgId: string, userId: string) {
  const member = await getActiveOrgMember(orgId, userId);
  if (!member || !isOrgRoleAllowed(member.role as OrgRole, ADMIN_ROLES)) {
    return { member: null as null, error: apiErrorJson("org_admin_required", 403) };
  }
  return { member, error: null };
}

export async function canAccessOrgPage(pageId: string, userId: string) {
  const page = await prisma.page.findFirst({
    where: { id: pageId, is_deleted: false },
    select: { id: true, owner_id: true, org_id: true },
  });
  if (!page) return { ok: false as const, error: apiErrorJson("not_found", 404) };
  if (page.owner_id === userId) return { ok: true as const, role: "owner" as OrgRole, page };
  if (!page.org_id) return { ok: false as const, error: apiErrorJson("org_access_denied", 403), page };
  const member = await getActiveOrgMember(page.org_id, userId);
  if (!member) return { ok: false as const, error: apiErrorJson("org_access_denied", 403), page };
  return { ok: true as const, role: (member.role as OrgRole) ?? "member", page };
}
