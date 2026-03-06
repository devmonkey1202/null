import { test, expect } from "@playwright/test";

async function createAnonPage(page: import("@playwright/test").Page, title: string) {
  const anonId = `anon_analytics_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const cookieHost = new URL(page.url());
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

  const createRes = await page.request.post("/api/pages", {
    headers: { "x-anon-user-id": anonId, "Content-Type": "application/json" },
    data: { title, content: { width: 360, height: 640, nodes: [] } },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  const pageId = created?.pageId ?? created?.id;
  expect(pageId).toBeTruthy();
  return { pageId: String(pageId), anonId };
}

test.describe.serial("analytics endpoints", () => {
  test.setTimeout(120_000);

  test("analytics summary + breakdown endpoints respond", async ({ page }) => {
    const { pageId, anonId } = await createAnonPage(page, `Analytics ${Date.now()}`);

    const ingestRes = await page.request.post(`/api/pages/${pageId}/events/ingest`, {
      headers: { "Content-Type": "application/json" },
      data: {
        session_id: `sess_${Date.now()}`,
        events: [
          {
            type: "enter",
            payload: {
              ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0",
              viewport_w: 1200,
            },
          },
          { type: "scroll", payload: { ts: 0.2 } },
          { type: "click", x: 20, y: 30, payload: { ts: 0.3 } },
        ],
      },
    });
    expect(ingestRes.ok()).toBeTruthy();

    const authHeaders = { "x-anon-user-id": anonId };
    const endpoints = [
      `/api/pages/${pageId}/analytics?period=7d`,
      `/api/pages/${pageId}/analytics/engagement?period=7d`,
      `/api/pages/${pageId}/analytics/by-browser?period=7d`,
      `/api/pages/${pageId}/analytics/by-os?period=7d`,
      `/api/pages/${pageId}/analytics/by-viewport?period=7d`,
      `/api/pages/${pageId}/analytics/by-weekday?period=7d`,
      `/api/pages/${pageId}/analytics/by-element?period=7d`,
      `/api/pages/${pageId}/analytics/compare?period=7d`,
      `/api/pages/${pageId}/analytics/funnel?period=7d`,
      `/api/pages/${pageId}/analytics/health?period=7d`,
    ];

    for (const url of endpoints) {
      const res = await page.request.get(url, { headers: authHeaders });
      expect(res.ok(), `analytics endpoint failed: ${url}`).toBeTruthy();
    }

    const exportRes = await page.request.get(`/api/pages/${pageId}/analytics/export?period=7d`, {
      headers: authHeaders,
    });
    expect(exportRes.ok()).toBeTruthy();
    const contentType = exportRes.headers()["content-type"] ?? "";
    expect(contentType.includes("text/csv")).toBeTruthy();
  });
});
