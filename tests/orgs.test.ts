import { describe, it, expect, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  organizationMember: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  team: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  teamMember: {
    create: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
  },
  page: {
    findFirst: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  createOrganization,
  inviteOrganizationMember,
  acceptOrganizationInvite,
  createTeam,
  updateOrganizationMemberRole,
  removeOrganizationMember,
  addTeamMember,
  removeTeamMember,
  assignPageToOrg,
  listOrgPages,
} from "@/lib/orgs";

describe("orgs", () => {
  it("creates organization with owner membership", async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    prismaMock.organization.create.mockResolvedValue({ id: "org1", slug: "acme" });

    const org = await createOrganization("user1", "Acme", null);
    expect(org.id).toBe("org1");
    const call = prismaMock.organization.create.mock.calls[0]?.[0];
    expect(call.data.owner_id).toBe("user1");
    expect(call.data.members.create.role).toBe("owner");
    expect(call.data.slug).toBe("acme");
  });

  it("invites organization member by email", async () => {
    prismaMock.organizationMember.findFirst
      .mockResolvedValueOnce({ id: "m1", role: "owner", status: "active" }) // actor
      .mockResolvedValueOnce(null); // existing member
    prismaMock.user.findFirst.mockResolvedValue({ id: "u2" });
    prismaMock.organizationMember.create.mockResolvedValue({ id: "m2", email: "invite@example.com" });

    const result = await inviteOrganizationMember("org1", "user1", "invite@example.com", "member");
    expect(result.ok).toBe(true);
    expect(prismaMock.organizationMember.create).toHaveBeenCalled();
  });

  it("accepts organization invite", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({ id: "m3", status: "invited", email: "u@example.com" });
    prismaMock.organizationMember.update.mockResolvedValue({ id: "m3", status: "active" });

    const result = await acceptOrganizationInvite("org1", "user1", "u@example.com");
    expect(result.ok).toBe(true);
    const call = prismaMock.organizationMember.update.mock.calls[0]?.[0];
    expect(call.data.status).toBe("active");
  });

  it("creates team when actor is admin", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({ id: "m1", role: "admin", status: "active" });
    prismaMock.team.create.mockResolvedValue({ id: "team1" });

    const result = await createTeam("org1", "user1", "Core", null);
    expect(result.ok).toBe(true);
    expect(prismaMock.team.create).toHaveBeenCalled();
  });

  it("updates and removes organization member when actor is admin", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({ id: "m1", role: "admin", status: "active" });
    prismaMock.organizationMember.update.mockResolvedValue({ id: "m2", role: "viewer" });

    const updated = await updateOrganizationMemberRole("org1", "user1", "m2", "viewer");
    expect(updated.ok).toBe(true);
    expect(prismaMock.organizationMember.update).toHaveBeenCalled();

    prismaMock.organizationMember.update.mockResolvedValue({ id: "m2", status: "removed" });
    const removed = await removeOrganizationMember("org1", "user1", "m2");
    expect(removed.ok).toBe(true);
  });

  it("adds and removes team members", async () => {
    prismaMock.organizationMember.findFirst
      .mockResolvedValueOnce({ id: "m1", role: "admin", status: "active" }) // actor
      .mockResolvedValueOnce({ id: "m2", status: "active" }); // member
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1" });
    prismaMock.teamMember.create.mockResolvedValue({ id: "tm1" });

    const added = await addTeamMember("org1", "t1", "user1", "m2");
    expect(added.ok).toBe(true);

    prismaMock.organizationMember.findFirst.mockResolvedValue({ id: "m1", role: "admin", status: "active" });
    prismaMock.teamMember.findFirst.mockResolvedValue({ id: "tm1" });
    prismaMock.teamMember.delete.mockResolvedValue({ id: "tm1" });
    const removed = await removeTeamMember("org1", "t1", "user1", "m2");
    expect(removed.ok).toBe(true);
  });

  it("assigns page to org and lists org pages", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValue({ id: "m1", role: "admin", status: "active" });
    prismaMock.page.findFirst.mockResolvedValue({ id: "p1" });
    prismaMock.page.update.mockResolvedValue({ id: "p1", org_id: "org1" });

    const assigned = await assignPageToOrg("org1", "user1", "p1");
    expect(assigned.ok).toBe(true);

    prismaMock.page.findMany.mockResolvedValue([{ id: "p1", title: "Page", owner_id: "user1", updated_at: new Date() }]);
    const pages = await listOrgPages("org1");
    expect(pages.length).toBe(1);
  });
});
