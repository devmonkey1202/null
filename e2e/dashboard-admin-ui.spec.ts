import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3101";

async function createPage(request: import("@playwright/test").APIRequestContext, anonId: string) {
  const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
  const res = await request.post(`${BASE}/api/pages`, {
    headers,
    data: JSON.stringify({ title: "Dashboard UI", content: { type: "doc", content: [] } }),
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const pageId = body?.page?.id ?? body?.pageId ?? body?.id;
  expect(pageId).toBeTruthy();
  return { pageId: String(pageId), headers };
}

test.describe.serial("dashboard admin ui", () => {
  test.setTimeout(120_000);

  test("secrets + app user role management", async ({ page, request }) => {
    const anonId = `anon_dash_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const { pageId, headers } = await createPage(request, anonId);

    await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });

    const email = `dash_${Date.now()}@example.com`;
    await request.post(`${BASE}/api/app/${pageId}/auth/register`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ email, password: "Password123!", display_name: "Dash User" }),
    });

    const cookieHost = new URL(BASE);
    await page.context().addCookies([
      {
        name: "anon_user_id",
        value: anonId,
        domain: cookieHost.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: cookieHost.protocol === "https:",
      },
    ]);

    await page.goto(`${BASE}/dashboard/${pageId}`, { waitUntil: "domcontentloaded" });

    await page.getByRole("heading", { name: "앱 시크릿" }).scrollIntoViewIfNeeded();
    await page.getByPlaceholder("API_KEY").fill("DASH_API_KEY");
    await page.getByPlaceholder("••••••••").fill("secret-value-123");
    await page.getByRole("button", { name: "시크릿 저장" }).click();
    await expect(page.getByText("DASH_API_KEY")).toBeVisible();

    await page.getByRole("heading", { name: "앱 사용자" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "새로고침" }).click();
    await expect(page.getByText(email)).toBeVisible();

    const userSection = page.locator("section", { has: page.getByRole("heading", { name: "앱 사용자" }) });
    const row = userSection
      .getByText(email)
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')]")
      .first();
    await row.locator('input[type="text"]').fill("editor");
    await row.getByRole("button", { name: "권한 저장" }).click();

    const listRes = await request.get(`${BASE}/api/app/${pageId}/auth/users?limit=10`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    const updated = (listData?.users ?? []).find((u: { email: string }) => u.email === email);
    expect(updated?.role).toBe("editor");
  });
});
