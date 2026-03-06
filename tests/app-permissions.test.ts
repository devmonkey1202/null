import { describe, it, expect } from "vitest";
import { isAppActionAllowed, isAppActionAllowedWithContext, normalizeAppRole } from "@/lib/app-permissions";

describe("app permissions", () => {
  it("normalizes roles", () => {
    expect(normalizeAppRole("ADMIN")).toBe("admin");
    expect(normalizeAppRole("unknown")).toBe("user");
  });

  it("allows admin to manage users", () => {
    expect(isAppActionAllowed("admin", "manage_users")).toBe(true);
  });

  it("restricts viewer to read", () => {
    expect(isAppActionAllowed("viewer", "read")).toBe(true);
    expect(isAppActionAllowed("viewer", "create")).toBe(false);
  });

  it("allows editor to update but not delete", () => {
    expect(isAppActionAllowed("editor", "update")).toBe(true);
    expect(isAppActionAllowed("editor", "delete")).toBe(false);
  });

  it("enforces ABAC on record ownership", () => {
    expect(isAppActionAllowedWithContext("editor", "update", {
      appUserId: "u1",
      recordAppUserId: "u1",
    })).toBe(true);
    expect(isAppActionAllowedWithContext("editor", "update", {
      appUserId: "u1",
      recordAppUserId: "u2",
    })).toBe(false);
  });

  it("allows admin regardless of record ownership", () => {
    expect(isAppActionAllowedWithContext("admin", "delete", {
      appUserId: "u1",
      recordAppUserId: "u2",
    })).toBe(true);
  });

  it("allows owner regardless of role", () => {
    expect(isAppActionAllowedWithContext("viewer", "delete", {
      isOwner: true,
      appUserId: "u1",
      recordAppUserId: "u2",
    })).toBe(true);
  });
});
