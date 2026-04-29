import { test, expect, APIRequestContext } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3101";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

function randomIp() {
  return `127.0.0.${Math.floor(Math.random() * 200) + 20}`;
}

async function initAnon(request: APIRequestContext, ip: string): Promise<string> {
  const res = await request.post(`${BASE}/api/anon/init`, {
    headers: { "x-forwarded-for": ip },
  });
  const data = await res.json();
  return data?.anonUserId ?? data?.anon_user_id ?? "";
}

async function createPage(request: APIRequestContext, anonId: string, ip: string): Promise<string> {
  const headers = { "x-anon-user-id": anonId, "x-forwarded-for": ip, "Content-Type": "application/json" };
  const res = await request.post(`${BASE}/api/pages`, {
    headers,
    data: JSON.stringify({
      title: `Admin Cron E2E ${Date.now()}`,
      content: { type: "doc", content: [] },
    }),
  });
  if (!res.ok()) return "";
  const body = await res.json();
  return body?.page?.id ?? body?.pageId ?? body?.id ?? "";
}

test.describe.serial("admin + cron routes", () => {
  let anonId = "";
  let pageId = "";
  let reportId = "";
  const ip = randomIp();

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request, ip);
    if (!anonId) return;

    pageId = await createPage(request, anonId, ip);
    if (!pageId) return;

    const headers = { "x-anon-user-id": anonId, "x-forwarded-for": ip, "Content-Type": "application/json" };
    await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });

    const reportRes = await request.post(`${BASE}/api/admin/pages/${pageId}/report`, {
      headers,
      data: JSON.stringify({ reason: "admin-e2e" }),
    });
    if (reportRes.ok()) {
      const data = await reportRes.json();
      reportId = data?.report?.id ?? data?.id ?? "";
    }

    await request.post(`${BASE}/api/admin/pages/${pageId}/upvote`, { headers });
  });

  test("admin pages live", async ({ request }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY not configured");
    const res = await request.get(`${BASE}/api/admin/pages/live?take=1`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("admin ip blocks get/post", async ({ request }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY not configured");
    const getRes = await request.get(`${BASE}/api/admin/ip-blocks?take=1`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    expect(getRes.ok()).toBeTruthy();

    const postRes = await request.post(`${BASE}/api/admin/ip-blocks`, {
      headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json" },
      data: JSON.stringify({ ip: randomIp(), reason: "e2e" }),
    });
    expect(postRes.ok()).toBeTruthy();
  });

  test("admin reports list", async ({ request }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY not configured");
    const res = await request.get(`${BASE}/api/admin/reports?take=1`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("admin settings get/post", async ({ request }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY not configured");
    const getRes = await request.get(`${BASE}/api/admin/settings`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    expect(getRes.ok()).toBeTruthy();

    const postRes = await request.post(`${BASE}/api/admin/settings`, {
      headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json" },
      data: JSON.stringify({ allow_noip_fallback: true }),
    });
    expect(postRes.ok()).toBeTruthy();
  });

  test("admin stats", async ({ request }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY not configured");
    const res = await request.get(`${BASE}/api/admin/stats`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("admin report handle", async ({ request }) => {
    test.skip(!ADMIN_KEY || !reportId, "admin/report not ready");
    const res = await request.post(`${BASE}/api/admin/${reportId}/handle`, {
      headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json" },
      data: JSON.stringify({ status: "resolved", action: "none", admin_note: "e2e" }),
    });
    expect(res.ok()).toBeTruthy();
  });

  test("admin hide + force-expire page", async ({ request }) => {
    test.skip(!ADMIN_KEY || !pageId, "admin/page not ready");
    const hideRes = await request.post(`${BASE}/api/admin/pages/${pageId}/hide`, {
      headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json" },
      data: JSON.stringify({ reason: "e2e-hide" }),
    });
    expect(hideRes.ok()).toBeTruthy();

    const expireRes = await request.post(`${BASE}/api/admin/pages/${pageId}/force-expire`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    expect(expireRes.ok()).toBeTruthy();
  });

  test("cron daily reports", async ({ request }) => {
    test.skip(!CRON_SECRET, "CRON_SECRET not configured");
    const res = await request.get(`${BASE}/api/cron/daily-reports`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("cron expire", async ({ request }) => {
    test.skip(!CRON_SECRET, "CRON_SECRET not configured");
    const res = await request.get(`${BASE}/api/cron/expire`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("cron workflows", async ({ request }) => {
    test.skip(!CRON_SECRET, "CRON_SECRET not configured");
    const res = await request.get(`${BASE}/api/cron/workflows`, {
      headers: { "x-null-cron-secret": CRON_SECRET },
    });
    expect(res.ok()).toBeTruthy();
  });
});
