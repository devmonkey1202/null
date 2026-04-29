import { describe, expect, it } from "vitest";

import { canAccessPublishedPage, isPublishedPageAccessible } from "@/lib/page-access";

describe("page-access", () => {
  it("allows deployed pages even when not live", () => {
    const page = {
      is_hidden: false,
      status: "draft",
      live_expires_at: null,
      deployed_at: new Date("2026-03-31T00:00:00.000Z"),
    };

    expect(isPublishedPageAccessible(page)).toBe(true);
    expect(canAccessPublishedPage(page, false)).toBe(true);
  });

  it("allows live pages before expiry", () => {
    const page = {
      is_hidden: false,
      status: "live",
      live_expires_at: new Date(Date.now() + 60_000),
      deployed_at: null,
    };

    expect(isPublishedPageAccessible(page)).toBe(true);
  });

  it("blocks hidden or expired pages for public users", () => {
    expect(
      canAccessPublishedPage(
        {
          is_hidden: true,
          status: "live",
          live_expires_at: new Date(Date.now() + 60_000),
          deployed_at: new Date("2026-03-31T00:00:00.000Z"),
        },
        false,
      ),
    ).toBe(false);

    expect(
      canAccessPublishedPage(
        {
          is_hidden: false,
          status: "live",
          live_expires_at: new Date(Date.now() - 60_000),
          deployed_at: null,
        },
        false,
      ),
    ).toBe(false);
  });

  it("always allows owners", () => {
    expect(
      canAccessPublishedPage(
        {
          is_hidden: true,
          status: "draft",
          live_expires_at: null,
          deployed_at: null,
        },
        true,
      ),
    ).toBe(true);
  });
});
