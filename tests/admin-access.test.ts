// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  adminUser: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  adminSession: {
    findFirst: vi.fn(),
  },
}));

const cookiesMock = vi.hoisted(() => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => null),
    set: vi.fn(),
  })),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("next/headers", () => cookiesMock);

import { requireAdminAccess } from "@/lib/admin-session";

describe("admin access guard", () => {
  beforeEach(() => {
    prismaMock.adminUser.findFirst.mockReset();
    prismaMock.adminUser.create.mockReset();
    prismaMock.adminSession.findFirst.mockReset();
    cookiesMock.cookies.mockClear();
    process.env.ADMIN_SECRET_SLUG = "ops";
    process.env.ADMIN_KEY = "secret-key";
    process.env.ADMIN_SESSION_SALT = "salt";
  });

  it("accepts valid x-admin-key header", async () => {
    prismaMock.adminUser.findFirst.mockResolvedValue({ id: "admin1", username: "admin1", role: "owner", is_active: true });
    const req = new Request("http://localhost/api", { headers: { "x-admin-key": "secret-key" } });
    const result = await requireAdminAccess(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.admin.id).toBe("admin1");
    }
  });

  it("rejects when key missing and no session", async () => {
    prismaMock.adminUser.findFirst.mockResolvedValue({ id: "admin1", username: "admin1", role: "owner", is_active: true });
    const req = new Request("http://localhost/api");
    const result = await requireAdminAccess(req);
    expect(result.ok).toBe(false);
  });
});
