import { test, expect, APIRequestContext } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3100";

async function initAnon(request: APIRequestContext): Promise<string> {
  const ip = `127.0.0.${Math.floor(Math.random() * 200) + 20}`;
  const res = await request.post(`${BASE}/api/anon/init`, {
    headers: { "x-forwarded-for": ip },
  });
  const data = await res.json();
  return data?.anonUserId ?? data?.anon_user_id ?? "";
}

async function createPage(request: APIRequestContext, anonId: string): Promise<string> {
  const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
  const res = await request.post(`${BASE}/api/pages`, {
    headers,
    data: JSON.stringify({
      title: "L2 API Scenario",
      content: { type: "doc", content: [] },
    }),
  });
  if (!res.ok()) return "";
  const body = await res.json();
  return body?.page?.id ?? body?.pageId ?? body?.id ?? "";
}

test.describe.serial("L2 API scenarios", () => {
  let anonId = "";
  let pageId = "";
  let workflowId = "";
  let recordId = "";
  let schemaReady = false;

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request);
    if (!anonId) return;

    pageId = await createPage(request, anonId);
    if (!pageId) return;

    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });

    const schemaPayload = {
      collections: [
        {
          slug: "orders",
          name: "Orders",
          strict: true,
          fields: [
            { name: "title", type: "string", required: true },
            { name: "amount", type: "number", min: 0 },
            { name: "paid", type: "boolean" },
          ],
        },
      ],
    };

    const schemaRes = await request.put(`${BASE}/api/app/${pageId}/schema`, {
      headers,
      data: JSON.stringify(schemaPayload),
    });
    schemaReady = schemaRes.ok();

    const workflowRes = await request.post(`${BASE}/api/app/${pageId}/workflows`, {
      headers,
      data: JSON.stringify({
        name: "Order Created Flow",
        trigger: { type: "record_created", collection: "orders" },
        steps: [{ type: "log", message: "Created {{record.title}}" }],
        enabled: true,
      }),
    });
    if (workflowRes.ok()) {
      const data = await workflowRes.json();
      workflowId = data?.workflow?.id ?? "";
    }
  });

  test.afterAll(async ({ request }) => {
    if (!pageId || !recordId || !anonId) return;
    const headers = { "x-anon-user-id": anonId };
    try {
      await request.delete(`${BASE}/api/app/${pageId}/orders/${recordId}`, { headers });
    } catch {
      // best-effort cleanup
    }
  });

  test("schema list returns collection", async ({ request }) => {
    test.skip(!pageId || !anonId || !schemaReady, "schema not ready");
    const headers = { "x-anon-user-id": anonId };
    const res = await request.get(`${BASE}/api/app/${pageId}/schema`, { headers });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const slugs = (data?.collections ?? []).map((c: { slug: string }) => c.slug);
    expect(slugs).toContain("orders");
  });

  test("record CRUD + workflow trigger", async ({ request }) => {
    test.skip(!pageId || !anonId || !schemaReady, "schema not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const createRes = await request.post(`${BASE}/api/app/${pageId}/orders`, {
      headers,
      data: JSON.stringify({ title: "Order 1", amount: 42, paid: true }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    recordId = created?.id ?? "";
    expect(recordId).toBeTruthy();

    const listRes = await request.get(`${BASE}/api/app/${pageId}/orders?limit=10`, { headers });
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    expect(Array.isArray(list?.items)).toBeTruthy();

    const getRes = await request.get(`${BASE}/api/app/${pageId}/orders/${recordId}`, { headers });
    expect(getRes.ok()).toBeTruthy();

    const patchRes = await request.patch(`${BASE}/api/app/${pageId}/orders/${recordId}`, {
      headers,
      data: JSON.stringify({ amount: 84 }),
    });
    expect(patchRes.ok()).toBeTruthy();
  });

  test("workflow logs available", async ({ request }) => {
    test.skip(!pageId || !anonId || !workflowId, "workflow not ready");
    const headers = { "x-anon-user-id": anonId };
    const res = await request.get(`${BASE}/api/app/${pageId}/workflows/logs?workflowId=${workflowId}&limit=10`, {
      headers,
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data?.logs)).toBeTruthy();
  });

  test("billing upgrade API responds", async ({ request }) => {
    test.skip(!anonId, "anon not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    const res = await request.post(`${BASE}/api/billing/upgrade`, {
      headers,
      data: JSON.stringify({ targetPlan: "standard" }),
    });

    const data = await res.json();
    if (res.ok()) {
      expect(data?.ok).toBe(true);
      expect(["standard", "pro", "enterprise"]).toContain(data?.plan);
      return;
    }

    // If billing provider is not configured, API must fail gracefully (non-5xx).
    expect(res.status()).toBeLessThan(500);
    expect(data?.ok).toBe(false);
    expect(typeof data?.error).toBe("string");
  });

  test("hosting settings + verification issue", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const putRes = await request.put(`${BASE}/api/app/${pageId}/hosting`, {
      headers,
      data: JSON.stringify({
        customDomain: "example.com",
        forceHttps: true,
        redirectWww: true,
      }),
    });
    expect(putRes.ok()).toBeTruthy();
    const putData = await putRes.json();
    expect(putData?.ok).toBe(true);

    const verifyRes = await request.post(`${BASE}/api/app/${pageId}/hosting/verify`, {
      headers,
      data: JSON.stringify({ action: "issue" }),
    });
    expect(verifyRes.ok()).toBeTruthy();
    const verifyData = await verifyRes.json();
    expect(verifyData?.ok).toBe(true);
    expect(verifyData?.instructions?.type).toBe("TXT");
  });

  test("mobile host config + package", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const putRes = await request.put(`${BASE}/api/app/${pageId}/mobile`, {
      headers,
      data: JSON.stringify({
        appName: "NULL L2 Host",
        appId: "com.null.l2",
        serverUrl: BASE,
        statusBarStyle: "dark",
      }),
    });
    expect(putRes.ok()).toBeTruthy();

    const getRes = await request.get(`${BASE}/api/app/${pageId}/mobile`, { headers });
    expect(getRes.ok()).toBeTruthy();

    const hostRes = await request.get(`${BASE}/api/app/${pageId}/mobile/host-config`, { headers });
    expect(hostRes.ok()).toBeTruthy();
    const hostData = await hostRes.json();
    expect(hostData?.capacitor).toBeTruthy();

    const pkgRes = await request.get(`${BASE}/api/app/${pageId}/mobile/package?type=capacitor`, { headers });
    expect(pkgRes.ok()).toBeTruthy();
    const pkgHeaders = pkgRes.headers();
    expect(pkgHeaders["content-type"]).toContain("application/zip");
  });
});
