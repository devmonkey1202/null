import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3101";

async function initAnon(request: typeof test extends (name: string, fn: (args: infer A) => void) => void ? A["request"] : never): Promise<string> {
  const ip = `127.0.0.${Math.floor(Math.random() * 200) + 20}`;
  const res = await request.post(`${BASE}/api/anon/init`, {
    headers: { "x-forwarded-for": ip },
  });
  const data = await res.json();
  return data?.anonUserId ?? data?.anon_user_id ?? "";
}

test.describe("Chat API", () => {
  let pageId: string;
  let anonId: string;

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request);
    expect(anonId).toBeTruthy();

    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    const createRes = await request.post(`${BASE}/api/pages`, {
      headers,
      data: JSON.stringify({
        title: "E2E Chat Test",
        content: { type: "doc", content: [] },
      }),
    });
    if (createRes.ok()) {
      const body = await createRes.json();
      pageId = body?.page?.id ?? body?.id ?? "";
    }

    if (pageId) {
      await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });
    }
  });

  test("GET /chat returns messages array", async ({ request }) => {
    test.skip(!pageId, "no page created");
    const headers = { "x-anon-user-id": anonId };
    const res = await request.get(`${BASE}/api/pages/${pageId}/chat?limit=10`, { headers });
    expect(res.status()).toBeLessThan(500);
    const data = await res.json();
    expect(Array.isArray(data?.messages)).toBeTruthy();
  });

  test("POST /chat creates a message", async ({ request }) => {
    test.skip(!pageId, "no page created");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    const res = await request.post(`${BASE}/api/pages/${pageId}/chat`, {
      headers,
      data: JSON.stringify({ content: "Hello E2E" }),
    });
    expect(res.status()).toBeLessThan(500);
    const data = await res.json();
    expect(data?.ok).toBe(true);
  });

  test("POST /chat without content returns 400", async ({ request }) => {
    test.skip(!pageId, "no page created");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    const res = await request.post(`${BASE}/api/pages/${pageId}/chat`, {
      headers,
      data: JSON.stringify({}),
    });
    expect(res.status()).toBe(400);
  });

  test("GET /chat after POST includes the sent message", async ({ request }) => {
    test.skip(!pageId, "no page created");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    await request.post(`${BASE}/api/pages/${pageId}/chat`, {
      headers,
      data: JSON.stringify({ content: "Verify message" }),
    });

    const res = await request.get(`${BASE}/api/pages/${pageId}/chat?limit=50`, {
      headers: { "x-anon-user-id": anonId },
    });
    const data = await res.json();
    const contents = (data?.messages ?? []).map((m: { content: string }) => m.content);
    expect(contents).toContain("Verify message");
  });

  test("GET /chat without anon returns messages (read is public)", async ({ request }) => {
    test.skip(!pageId, "no page created");
    const res = await request.get(`${BASE}/api/pages/${pageId}/chat?limit=10`);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /chat without anon returns 401", async ({ request }) => {
    test.skip(!pageId, "no page created");
    const res = await request.post(`${BASE}/api/pages/${pageId}/chat`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ content: "should fail" }),
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Asset API health", () => {
  let anonId: string;

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request);
  });

  test("GET /ranking returns without 500", async ({ request }) => {
    const res = await request.get(`${BASE}/api/ranking?limit=10`);
    expect(res.status()).toBeLessThan(500);
  });

  test("GET /me returns user info", async ({ request }) => {
    const res = await request.get(`${BASE}/api/me`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(res.status()).toBeLessThan(500);
    const data = await res.json();
    expect(data?.anonUserId || data?.anon_user_id || data?.isLoggedIn !== undefined).toBeTruthy();
  });

  test("GET /health returns ok", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data?.ok).toBe(true);
  });
});
