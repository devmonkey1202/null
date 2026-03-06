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
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { createOrganization, inviteOrganizationMember, acceptOrganizationInvite, createTeam } from "@/lib/orgs";

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
});
