import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth";
import { randomBytes } from "crypto";
import { getActiveOrgMember, isOrgRoleAllowed, type OrgRole } from "@/lib/org-access";

const ADMIN_ROLES: OrgRole[] = ["owner", "admin"];

function slugify(input: string) {
  const raw = input.trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "";
}

function fallbackSlug() {
  return `org-${randomBytes(2).toString("hex")}`;
}

async function ensureUniqueSlug(base: string) {
  let slug = base || fallbackSlug();
  let i = 1;
  while (true) {
    const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
    slug = `${base || "org"}-${i}`;
    i += 1;
    if (i > 50) return `${base || "org"}-${randomBytes(3).toString("hex")}`;
  }
}

export async function createOrganization(userId: string, name: string, slug?: string | null) {
  const baseSlug = slugify(slug ?? name);
  const finalSlug = await ensureUniqueSlug(baseSlug);
  const now = new Date();
  return prisma.organization.create({
    data: {
      name,
      slug: finalSlug,
      owner_id: userId,
      members: {
        create: {
          user_id: userId,
          email: null,
          role: "owner",
          status: "active",
          invited_at: now,
          joined_at: now,
        },
      },
    },
  });
}

export async function listOrganizationsForUser(userId: string) {
  const members = await prisma.organizationMember.findMany({
    where: { user_id: userId, status: "active" },
    include: { org: true },
    orderBy: { created_at: "asc" },
  });
  return members.map((m) => ({
    id: m.org.id,
    name: m.org.name,
    slug: m.org.slug,
    owner_id: m.org.owner_id,
    role: m.role,
    member_id: m.id,
  }));
}

export async function listOrganizationMembers(orgId: string) {
  const members = await prisma.organizationMember.findMany({
    where: { org_id: orgId },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { created_at: "asc" },
  });
  return members.map((m) => ({
    id: m.id,
    org_id: m.org_id,
    user_id: m.user_id,
    email: m.email ?? m.user?.email ?? null,
    role: m.role,
    status: m.status,
    invited_at: m.invited_at,
    joined_at: m.joined_at,
  }));
}

export async function inviteOrganizationMember(
  orgId: string,
  actorUserId: string,
  email: string,
  role: OrgRole = "member"
) {
  const actor = await getActiveOrgMember(orgId, actorUserId);
  if (!actor || !isOrgRoleAllowed(actor.role as OrgRole, ADMIN_ROLES)) {
    return { ok: false as const, error: "org_admin_required" };
  }

  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false as const, error: "email_required" };

  const existing = await prisma.organizationMember.findFirst({
    where: { org_id: orgId, email: normalized },
  });

  const linkedUser = await prisma.user.findFirst({
    where: { email: normalized },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.organizationMember.update({
      where: { id: existing.id },
      data: {
        role: role ?? existing.role,
        status: "invited",
        user_id: linkedUser?.id ?? existing.user_id,
        invited_at: new Date(),
      },
    });
    return { ok: true as const, member: updated };
  }

  const created = await prisma.organizationMember.create({
    data: {
      org_id: orgId,
      user_id: linkedUser?.id ?? null,
      email: normalized,
      role,
      status: "invited",
      invited_at: new Date(),
    },
  });
  return { ok: true as const, member: created };
}

export async function acceptOrganizationInvite(orgId: string, userId: string, email: string | null) {
  const normalized = normalizeEmail(email ?? "");
  if (!normalized) return { ok: false as const, error: "email_required" };
  const member = await prisma.organizationMember.findFirst({
    where: { org_id: orgId, email: normalized, status: "invited" },
  });
  if (!member) return { ok: false as const, error: "invite_not_found" };
  const updated = await prisma.organizationMember.update({
    where: { id: member.id },
    data: { user_id: userId, status: "active", joined_at: new Date() },
  });
  return { ok: true as const, member: updated };
}

export async function updateOrganizationMemberRole(
  orgId: string,
  actorUserId: string,
  memberId: string,
  role: OrgRole
) {
  const actor = await getActiveOrgMember(orgId, actorUserId);
  if (!actor || !isOrgRoleAllowed(actor.role as OrgRole, ADMIN_ROLES)) {
    return { ok: false as const, error: "org_admin_required" };
  }
  const updated = await prisma.organizationMember.update({
    where: { id: memberId },
    data: { role },
  });
  return { ok: true as const, member: updated };
}

export async function removeOrganizationMember(orgId: string, actorUserId: string, memberId: string) {
  const actor = await getActiveOrgMember(orgId, actorUserId);
  if (!actor || !isOrgRoleAllowed(actor.role as OrgRole, ADMIN_ROLES)) {
    return { ok: false as const, error: "org_admin_required" };
  }
  const updated = await prisma.organizationMember.update({
    where: { id: memberId },
    data: { status: "removed" },
  });
  return { ok: true as const, member: updated };
}

export async function listTeams(orgId: string) {
  const teams = await prisma.team.findMany({
    where: { org_id: orgId },
    orderBy: { created_at: "asc" },
  });
  return teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug, org_id: t.org_id }));
}

export async function createTeam(orgId: string, actorUserId: string, name: string, slug?: string | null) {
  const actor = await getActiveOrgMember(orgId, actorUserId);
  if (!actor || !isOrgRoleAllowed(actor.role as OrgRole, ADMIN_ROLES)) {
    return { ok: false as const, error: "org_admin_required" };
  }
  const baseSlug = slugify(slug ?? name);
  const finalSlug = baseSlug || fallbackSlug();
  const team = await prisma.team.create({
    data: { org_id: orgId, name, slug: finalSlug },
  });
  return { ok: true as const, team };
}

export async function listTeamMembers(teamId: string) {
  const members = await prisma.teamMember.findMany({
    where: { team_id: teamId },
    include: { org_member: { include: { user: { select: { id: true, email: true } } } } },
  });
  return members.map((m) => ({
    id: m.id,
    team_id: m.team_id,
    org_member_id: m.org_member_id,
    role: m.role,
    user_id: m.org_member.user_id,
    email: m.org_member.email ?? m.org_member.user?.email ?? null,
  }));
}

export async function addTeamMember(orgId: string, teamId: string, actorUserId: string, orgMemberId: string) {
  const actor = await getActiveOrgMember(orgId, actorUserId);
  if (!actor || !isOrgRoleAllowed(actor.role as OrgRole, ADMIN_ROLES)) {
    return { ok: false as const, error: "org_admin_required" };
  }
  const member = await prisma.organizationMember.findFirst({
    where: { id: orgMemberId, org_id: orgId, status: "active" },
  });
  if (!member) return { ok: false as const, error: "org_member_not_found" };
  const team = await prisma.team.findFirst({ where: { id: teamId, org_id: orgId } });
  if (!team) return { ok: false as const, error: "team_not_found" };
  const created = await prisma.teamMember.create({
    data: { team_id: teamId, org_member_id: member.id, role: "member" },
  });
  return { ok: true as const, member: created };
}

export async function removeTeamMember(orgId: string, teamId: string, actorUserId: string, orgMemberId: string) {
  const actor = await getActiveOrgMember(orgId, actorUserId);
  if (!actor || !isOrgRoleAllowed(actor.role as OrgRole, ADMIN_ROLES)) {
    return { ok: false as const, error: "org_admin_required" };
  }
  const existing = await prisma.teamMember.findFirst({
    where: { team_id: teamId, org_member_id: orgMemberId },
  });
  if (!existing) return { ok: false as const, error: "team_member_not_found" };
  await prisma.teamMember.delete({ where: { id: existing.id } });
  return { ok: true as const };
}

export async function assignPageToOrg(orgId: string, actorUserId: string, pageId: string | null) {
  const actor = await getActiveOrgMember(orgId, actorUserId);
  if (!actor || !isOrgRoleAllowed(actor.role as OrgRole, ADMIN_ROLES)) {
    return { ok: false as const, error: "org_admin_required" };
  }
  if (!pageId) return { ok: false as const, error: "page_id_required" };
  const page = await prisma.page.findFirst({
    where: { id: pageId, owner_id: actorUserId, is_deleted: false },
    select: { id: true },
  });
  if (!page) return { ok: false as const, error: "page_not_found" };
  const updated = await prisma.page.update({
    where: { id: pageId },
    data: { org_id: orgId },
  });
  return { ok: true as const, page: updated };
}

export async function listOrgPages(orgId: string) {
  return prisma.page.findMany({
    where: { org_id: orgId, is_deleted: false },
    select: { id: true, title: true, owner_id: true, updated_at: true },
    orderBy: { updated_at: "desc" },
  });
}
