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
      title: "L2 App User Data",
      content: { type: "doc", content: [] },
    }),
  });
  if (!res.ok()) return "";
  const body = await res.json();
  return body?.page?.id ?? body?.pageId ?? body?.id ?? "";
}

async function registerAppUser(request: APIRequestContext, pageId: string, email: string, password: string) {
  const res = await request.post(`${BASE}/api/app/${pageId}/auth/register`, {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ email, password, display_name: "L2 User" }),
  });
  if (!res.ok()) return { token: "", userId: "" };
  const data = await res.json();
  return { token: data?.token ?? "", userId: data?.user?.id ?? "" };
}

test.describe.serial("L2 App user data access", () => {
  let anonId = "";
  let pageId = "";
  let tokenA = "";
  let tokenB = "";
  let recordA = "";
  let recordB = "";

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
          slug: "notes",
          name: "Notes",
          strict: true,
          fields: [
            { name: "title", type: "string", required: true },
            { name: "body", type: "string" },
            { name: "app_user_id", type: "string", required: true },
          ],
        },
      ],
    };
    await request.put(`${BASE}/api/app/${pageId}/schema`, {
      headers,
      data: JSON.stringify(schemaPayload),
    });

    const now = Date.now();
    const userA = await registerAppUser(request, pageId, `l2a_${now}@example.com`, "Password123!");
    const userB = await registerAppUser(request, pageId, `l2b_${now}@example.com`, "Password123!");
    tokenA = userA.token;
    tokenB = userB.token;
  });

  test("app user can create own record", async ({ request }) => {
    test.skip(!pageId || !tokenA, "setup not ready");
    const res = await request.post(`${BASE}/api/app/${pageId}/notes`, {
      headers: { authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      data: JSON.stringify({ title: "User A Note", body: "Hello A" }),
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    recordA = data?.id ?? "";
    expect(recordA).toBeTruthy();
    expect(typeof data?.app_user_id).toBe("string");
    expect(data?.title).toBe("User A Note");
  });

  test("app user list is scoped by app_user_id", async ({ request }) => {
    test.skip(!pageId || !tokenA || !recordA, "setup not ready");
    const res = await request.get(`${BASE}/api/app/${pageId}/notes?limit=10`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data?.items)).toBeTruthy();
    const ids = data.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(recordA);
  });

  test("second user record does not leak", async ({ request }) => {
    test.skip(!pageId || !tokenA || !tokenB, "setup not ready");
    const createRes = await request.post(`${BASE}/api/app/${pageId}/notes`, {
      headers: { authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      data: JSON.stringify({ title: "User B Note", body: "Hello B" }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    recordB = created?.id ?? "";
    expect(recordB).toBeTruthy();

    const listRes = await request.get(`${BASE}/api/app/${pageId}/notes?limit=10`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    const ids = listData.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(recordA);
    expect(ids).not.toContain(recordB);
  });

  test("owner can see all records", async ({ request }) => {
    test.skip(!pageId || !anonId || !recordA || !recordB, "setup not ready");
    const res = await request.get(`${BASE}/api/app/${pageId}/notes?limit=10`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const ids = data.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(recordA);
    expect(ids).toContain(recordB);
  });

  test("unauthenticated access is blocked", async ({ request }) => {
    test.skip(!pageId, "setup not ready");
    const res = await request.get(`${BASE}/api/app/${pageId}/notes?limit=10`);
    expect(res.status()).toBe(401);
    const data = await res.json();
    expect(data?.error).toBe("auth_required");
  });
});
