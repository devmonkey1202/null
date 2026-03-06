// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appSession: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { getAppUserByToken } from "@/lib/app-auth";

describe("app session expiration", () => {
  beforeEach(() => {
    prismaMock.appSession.findUnique.mockReset();
    prismaMock.appSession.delete.mockReset();
  });

  it("returns null and deletes expired session", async () => {
    const expired = new Date(Date.now() - 60_000);
    prismaMock.appSession.findUnique.mockResolvedValue({
      id: "sess_expired",
      expires_at: expired,
      app_user: {
        id: "user1",
        email: "u1@example.com",
        display_name: "User1",
        avatar_url: null,
        role: "user",
        metadata: {},
        created_at: new Date(),
      },
    });

    const result = await getAppUserByToken("token_expired");
    expect(result).toBeNull();
    expect(prismaMock.appSession.delete).toHaveBeenCalledWith({ where: { id: "sess_expired" } });
  });

  it("returns user when session is valid", async () => {
    const active = new Date(Date.now() + 60_000);
    prismaMock.appSession.findUnique.mockResolvedValue({
      id: "sess_ok",
      expires_at: active,
      app_user: {
        id: "user2",
        email: "u2@example.com",
        display_name: null,
        avatar_url: null,
        role: "admin",
        metadata: {},
        created_at: new Date(),
      },
    });

    const result = await getAppUserByToken("token_ok");
    expect(result?.email).toBe("u2@example.com");
    expect(result?.role).toBe("admin");
    expect(prismaMock.appSession.delete).not.toHaveBeenCalled();
  });
});
