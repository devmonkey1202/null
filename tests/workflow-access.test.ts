// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  page: { findFirst: vi.fn() },
}));

const anonMock = vi.hoisted(() => ({
  resolveAnonUserId: vi.fn(),
}));

const appRequestMock = vi.hoisted(() => ({
  resolveAppUserFromRequest: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/anon", () => anonMock);
vi.mock("@/lib/app-request", () => appRequestMock);

import { requireWorkflowAdmin } from "@/lib/workflow-access";

describe("workflow access control", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.page.findFirst.mockReset();
    anonMock.resolveAnonUserId.mockReset();
    appRequestMock.resolveAppUserFromRequest.mockReset();
  });

  it("allows page owner via anon user", async () => {
    anonMock.resolveAnonUserId.mockResolvedValue("anon-1");
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
    prismaMock.page.findFirst.mockResolvedValue({ id: "page-1" });
    appRequestMock.resolveAppUserFromRequest.mockResolvedValue(null);

    const req = new Request("http://localhost/api");
    const result = await requireWorkflowAdmin("page-1", req);
    expect(result.error).toBeNull();
    expect(result.actor?.userId).toBe("user-1");
    expect(result.actor?.isOwner).toBe(true);
  });

  it("allows app admin user", async () => {
    anonMock.resolveAnonUserId.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.page.findFirst.mockResolvedValue(null);
    appRequestMock.resolveAppUserFromRequest.mockResolvedValue({ id: "app-1", role: "admin" });

    const req = new Request("http://localhost/api");
    const result = await requireWorkflowAdmin("page-2", req);
    expect(result.error).toBeNull();
    expect(result.actor?.appUserId).toBe("app-1");
    expect(result.actor?.isAppAdmin).toBe(true);
  });

  it("rejects non-admin app user", async () => {
    anonMock.resolveAnonUserId.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.page.findFirst.mockResolvedValue(null);
    appRequestMock.resolveAppUserFromRequest.mockResolvedValue({ id: "app-2", role: "user" });

    const req = new Request("http://localhost/api");
    const result = await requireWorkflowAdmin("page-3", req);
    expect(result.error).not.toBeNull();
    expect(result.actor).toBeNull();
  });
});
