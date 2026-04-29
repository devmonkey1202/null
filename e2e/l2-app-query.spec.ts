import { test, expect, APIRequestContext } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3101";

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
      title: "L2 App Query",
      content: { type: "doc", content: [] },
    }),
  });
  if (!res.ok()) return "";
  const body = await res.json();
  return body?.page?.id ?? body?.pageId ?? body?.id ?? "";
}

async function expectOk(res: { ok(): boolean; status(): number; text(): Promise<string> }, label: string) {
  if (res.ok()) return;
  const body = await res.text();
  throw new Error(`${label} failed: ${res.status()} ${body}`);
}

test.describe.serial("L2 App query scenarios", () => {
  let anonId = "";
  let pageId = "";

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request);
    if (!anonId) return;

    pageId = await createPage(request, anonId);
    if (!pageId) return;

    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    const publishRes = await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });
    await expectOk(publishRes, "publish");

    const schemaPayload = {
      collections: [
        {
          slug: "orders",
          name: "Orders",
          strict: true,
          fields: [
            { name: "title", type: "string", required: true },
            { name: "status", type: "string", required: true },
            { name: "amount", type: "number", required: true },
            { name: "paid", type: "boolean" },
            { name: "ordered_at", type: "date" },
          ],
        },
      ],
    };
    const schemaRes = await request.put(`${BASE}/api/app/${pageId}/schema`, {
      headers,
      data: JSON.stringify(schemaPayload),
    });
    await expectOk(schemaRes, "schema");

    const records = [
      { title: "Alpha", status: "draft", amount: 25, paid: false, ordered_at: "2026-02-01T00:00:00Z" },
      { title: "Beta", status: "shipped", amount: 120, paid: true, ordered_at: "2026-02-10T00:00:00Z" },
      { title: "Gamma Alpha", status: "processing", amount: 75, paid: false, ordered_at: "2026-03-01T00:00:00Z" },
    ];

    for (const record of records) {
      await request.post(`${BASE}/api/app/${pageId}/orders`, {
        headers,
        data: JSON.stringify(record),
      });
    }
  });

  test("filter by status equals", async ({ request }) => {
    test.skip(!pageId || !anonId, "setup not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json", "x-null-action": "query" };
    const res = await request.post(`${BASE}/api/app/${pageId}/orders?action=query`, {
      headers,
      data: JSON.stringify({ filters: [{ field: "status", op: "eq", value: "shipped" }] }),
    });
    await expectOk(res, "status filter");
    const data = await res.json();
    expect(data?.items?.length).toBe(1);
    expect(data.items[0]?.status).toBe("shipped");
  });

  test("numeric greater-than filter", async ({ request }) => {
    test.skip(!pageId || !anonId, "setup not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json", "x-null-action": "query" };
    const res = await request.post(`${BASE}/api/app/${pageId}/orders?action=query`, {
      headers,
      data: JSON.stringify({ filters: [{ field: "amount", op: "gt", value: 50 }] }),
    });
    await expectOk(res, "amount filter");
    const data = await res.json();
    const amounts = (data.items ?? []).map((item: { amount: number }) => item.amount).sort((a: number, b: number) => a - b);
    expect(amounts).toEqual([75, 120]);
  });

  test("date range filter", async ({ request }) => {
    test.skip(!pageId || !anonId, "setup not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json", "x-null-action": "query" };
    const res = await request.post(`${BASE}/api/app/${pageId}/orders?action=query`, {
      headers,
      data: JSON.stringify({ filters: [{ field: "ordered_at", op: "gte", value: "2026-02-15T00:00:00Z" }] }),
    });
    await expectOk(res, "date filter");
    const data = await res.json();
    expect(data?.items?.length).toBe(1);
    expect(data.items[0]?.title).toBe("Gamma Alpha");
  });

  test("search across string fields", async ({ request }) => {
    test.skip(!pageId || !anonId, "setup not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json", "x-null-action": "query" };
    const res = await request.post(`${BASE}/api/app/${pageId}/orders?action=query`, {
      headers,
      data: JSON.stringify({ search: { q: "alpha" } }),
    });
    await expectOk(res, "search");
    const data = await res.json();
    const titles = (data.items ?? []).map((item: { title: string }) => item.title).sort();
    expect(titles).toEqual(["Alpha", "Gamma Alpha"]);
  });

  test("aggregate sum", async ({ request }) => {
    test.skip(!pageId || !anonId, "setup not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    const res = await request.post(`${BASE}/api/app/${pageId}/orders?action=query`, {
      headers,
      data: JSON.stringify({ aggregate: { op: "sum", field: "amount" } }),
    });
    await expectOk(res, "aggregate");
    const data = await res.json();
    expect(data?.aggregate?.value).toBe(220);
  });
});
