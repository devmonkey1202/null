import { test, expect } from "@playwright/test";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
const ADMIN_SECRET_SLUG = process.env.ADMIN_SECRET_SLUG ?? "";

test.describe("ops metrics", () => {
  test("responds with admin key", async ({ request }) => {
    test.skip(!ADMIN_KEY || !ADMIN_SECRET_SLUG, "admin not configured");

    const res = await request.get("/api/ops/metrics", {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.counts).toBeTruthy();
  });
});
