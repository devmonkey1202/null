import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appSsoConnection: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  appSsoAccount: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  appUser: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  appSession: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: vi.fn() }));

import { createSsoConnection, loginWithSso } from "@/lib/app-sso";

describe("app sso", () => {
  beforeEach(() => {
    prismaMock.appSsoConnection.findFirst.mockReset();
    prismaMock.appSsoConnection.create.mockReset();
    prismaMock.appSsoAccount.findUnique.mockReset();
    prismaMock.appSsoAccount.create.mockReset();
    prismaMock.appUser.findUnique.mockReset();
    prismaMock.appUser.create.mockReset();
    prismaMock.appSession.create.mockReset();
  });

  it("creates sso connection with normalized input", async () => {
    prismaMock.appSsoConnection.create.mockResolvedValue({ id: "conn1", provider: "oauth", name: "Google" });
    const connection = await createSsoConnection("page1", { provider: "oauth", name: "Google", enabled: false });
    expect(connection.id).toBe("conn1");
    const args = prismaMock.appSsoConnection.create.mock.calls[0]?.[0];
    expect(args.data.page_id).toBe("page1");
    expect(args.data.provider).toBe("oauth");
    expect(args.data.name).toBe("Google");
  });

  it("auto-provisions user when sso account is missing", async () => {
    prismaMock.appSsoConnection.findFirst.mockResolvedValue({
      id: "conn1",
      provider: "oauth",
      name: "google",
      enabled: true,
      auto_provision: true,
      allow_unlinked: false,
      default_role: "user",
    });
    prismaMock.appSsoAccount.findUnique.mockResolvedValue(null);
    prismaMock.appUser.create.mockResolvedValue({
      id: "user1",
      email: "u@example.com",
      display_name: "User",
      avatar_url: null,
      role: "user",
      metadata: {},
      created_at: new Date(),
    });
    prismaMock.appSsoAccount.create.mockResolvedValue({
      id: "acct1",
      app_user_id: "user1",
      app_user: {
        id: "user1",
        email: "u@example.com",
        display_name: "User",
        avatar_url: null,
        role: "user",
        metadata: {},
        created_at: new Date(),
      },
    });
    prismaMock.appSession.create.mockResolvedValue({ id: "sess1" });

    const result = await loginWithSso("page1", {
      provider: "oauth",
      connectionName: "google",
      payload: { email: "u@example.com", subject: "sub1", displayName: "User" },
    });

    expect(result.created).toBe(true);
    expect(result.user.email).toBe("u@example.com");
    expect(prismaMock.appSession.create).toHaveBeenCalled();
  });
});
