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
      title: "L2 Versioning",
      content: { type: "doc", content: [] },
    }),
  });
  if (!res.ok()) return "";
  const body = await res.json();
  return body?.page?.id ?? body?.pageId ?? body?.id ?? "";
}

test.describe.serial("L2 Versioning scenarios", () => {
  let anonId = "";
  let pageId = "";
  let recordId = "";
  let workflowId = "";

  test.beforeAll(async ({ request }) => {
    anonId = await initAnon(request);
    if (!anonId) return;

    pageId = await createPage(request, anonId);
    if (!pageId) return;

    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
    await request.post(`${BASE}/api/pages/${pageId}/publish`, { headers });

    await request.put(`${BASE}/api/app/${pageId}/schema`, {
      headers,
      data: JSON.stringify({
        collections: [
          {
            slug: "items",
            name: "Items",
            strict: true,
            fields: [{ name: "title", type: "string", required: true }],
          },
        ],
      }),
    });
  });

  test("record versions created on create/update", async ({ request }) => {
    test.skip(!pageId || !anonId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const createRes = await request.post(`${BASE}/api/app/${pageId}/items`, {
      headers,
      data: JSON.stringify({ title: "Item 1" }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    recordId = created?.id ?? "";
    expect(recordId).toBeTruthy();

    const patchRes = await request.patch(`${BASE}/api/app/${pageId}/items/${recordId}`, {
      headers,
      data: JSON.stringify({ title: "Item 1 updated" }),
    });
    expect(patchRes.ok()).toBeTruthy();

    const versionsRes = await request.get(
      `${BASE}/api/app/${pageId}/items/${recordId}/versions?limit=10`,
      { headers: { "x-anon-user-id": anonId } },
    );
    expect(versionsRes.ok()).toBeTruthy();
    const data = await versionsRes.json();
    const actions = (data?.versions ?? []).map((v: { action: string }) => v.action);
    expect(actions).toContain("created");
    expect(actions).toContain("updated");
  });

  test("record restore from version", async ({ request }) => {
    test.skip(!pageId || !anonId || !recordId, "record not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const versionsRes = await request.get(
      `${BASE}/api/app/${pageId}/items/${recordId}/versions?limit=5`,
      { headers: { "x-anon-user-id": anonId } },
    );
    expect(versionsRes.ok()).toBeTruthy();
    const data = await versionsRes.json();
    const firstVersion = (data?.versions ?? [])[data?.versions?.length - 1];
    expect(firstVersion?.id).toBeTruthy();

    const restoreRes = await request.post(
      `${BASE}/api/app/${pageId}/items/${recordId}/versions/restore`,
      { headers, data: JSON.stringify({ versionId: firstVersion.id }) },
    );
    expect(restoreRes.ok()).toBeTruthy();
    const restored = await restoreRes.json();
    expect(restored?.ok).toBe(true);
  });

  test("workflow versions created on create/update", async ({ request }) => {
    test.skip(!pageId, "page not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const createRes = await request.post(`${BASE}/api/app/${pageId}/workflows`, {
      headers,
      data: JSON.stringify({
        name: "Versioned Flow",
        trigger: { type: "record_created", collection: "items" },
        steps: [{ type: "log", message: "Created" }],
        enabled: true,
      }),
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    workflowId = created?.workflow?.id ?? "";
    expect(workflowId).toBeTruthy();

    const patchRes = await request.patch(`${BASE}/api/app/${pageId}/workflows`, {
      headers,
      data: JSON.stringify({ id: workflowId, name: "Versioned Flow v2" }),
    });
    expect(patchRes.ok()).toBeTruthy();

    const versionsRes = await request.get(
      `${BASE}/api/app/${pageId}/workflows/versions?workflowId=${workflowId}&limit=10`,
      { headers: { "x-anon-user-id": anonId } },
    );
    expect(versionsRes.ok()).toBeTruthy();
    const data = await versionsRes.json();
    const versions = (data?.versions ?? []).map((v: { version: number }) => v.version);
    expect(versions).toContain(1);
    expect(versions).toContain(2);
  });

  test("workflow restore from version", async ({ request }) => {
    test.skip(!pageId || !anonId || !workflowId, "workflow not ready");
    const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };

    const versionsRes = await request.get(
      `${BASE}/api/app/${pageId}/workflows/versions?workflowId=${workflowId}&limit=5`,
      { headers: { "x-anon-user-id": anonId } },
    );
    expect(versionsRes.ok()).toBeTruthy();
    const data = await versionsRes.json();
    const firstVersion = (data?.versions ?? [])[data?.versions?.length - 1];
    expect(firstVersion?.id).toBeTruthy();

    const restoreRes = await request.post(
      `${BASE}/api/app/${pageId}/workflows/versions/restore`,
      { headers, data: JSON.stringify({ versionId: firstVersion.id }) },
    );
    expect(restoreRes.ok()).toBeTruthy();
    const restored = await restoreRes.json();
    expect(restored?.ok).toBe(true);
  });
});
