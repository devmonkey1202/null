import { test, expect } from "@playwright/test";

test.describe("webhook flow", () => {
  test("alerts test/notify send to mock webhook", async ({ request }) => {
    const anonUserId = `anon_webhook_${Date.now()}`;
    const port = process.env.PLAYWRIGHT_TEST_PORT ?? "3101";
    const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? `http://127.0.0.1:${port}`;

    const ip = `127.0.0.${Math.floor(Math.random() * 200) + 20}`;
    const createRes = await request.post("/api/pages", {
      headers: { "x-anon-user-id": anonUserId, "Content-Type": "application/json", "x-forwarded-for": ip },
      data: { title: `Webhook Test ${Date.now()}`, content: { width: 360, height: 640, nodes: [] } },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const pageId = created?.pageId ?? created?.id;
    expect(pageId).toBeTruthy();

    const settingsRes = await request.patch(`/api/pages/${pageId}/alerts/settings`, {
      headers: { "x-anon-user-id": anonUserId, "Content-Type": "application/json", "x-forwarded-for": ip },
      data: { discord_webhook_url: `${baseURL}/api/dev/webhook` },
    });
    expect(settingsRes.ok()).toBeTruthy();

    const testRes = await request.post(`/api/pages/${pageId}/alerts/test`, {
      headers: { "x-anon-user-id": anonUserId, "x-forwarded-for": ip },
    });
    if (!testRes.ok()) {
      const detail = await testRes.text();
      throw new Error(`alerts/test failed: ${testRes.status()} ${detail}`);
    }

    const notifyRes = await request.post(`/api/pages/${pageId}/alerts/notify`, {
      headers: { "x-anon-user-id": anonUserId, "Content-Type": "application/json", "x-forwarded-for": ip },
      data: { type: "spike", start: "00:00", end: "00:05", clicks: 3, leaves: 1 },
    });
    if (!notifyRes.ok()) {
      const detail = await notifyRes.text();
      throw new Error(`alerts/notify failed: ${notifyRes.status()} ${detail}`);
    }
  });
});
