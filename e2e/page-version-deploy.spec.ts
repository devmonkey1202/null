import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3100";

async function createPage(request: import("@playwright/test").APIRequestContext, anonId: string) {
  const headers = { "x-anon-user-id": anonId, "Content-Type": "application/json" };
  const res = await request.post(`${BASE}/api/pages`, {
    headers,
    data: JSON.stringify({ title: "Version Deploy", content: { type: "doc", content: [] } }),
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const pageId = body?.page?.id ?? body?.pageId ?? body?.id;
  expect(pageId).toBeTruthy();
  return { pageId: String(pageId), headers };
}

test.describe.serial("page version rollback + deploy", () => {
  test.setTimeout(120_000);

  test("creates versions, restores, and deploys", async ({ request }) => {
    const anonId = `anon_version_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const { pageId, headers } = await createPage(request, anonId);

    const v1 = await request.post(`${BASE}/api/pages/${pageId}/version`, {
      headers,
      data: JSON.stringify({ title: "v1", content: { type: "doc", content: [{ type: "text", text: "v1" }] } }),
    });
    expect(v1.ok()).toBeTruthy();

    const v2 = await request.post(`${BASE}/api/pages/${pageId}/version`, {
      headers,
      data: JSON.stringify({ title: "v2", content: { type: "doc", content: [{ type: "text", text: "v2" }] } }),
    });
    expect(v2.ok()).toBeTruthy();

    const listRes = await request.get(`${BASE}/api/pages/${pageId}/versions`, { headers });
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    const versions = listData?.versions ?? [];
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const oldest = versions[versions.length - 1];

    const restoreRes = await request.post(`${BASE}/api/pages/${pageId}/version/restore`, {
      headers,
      data: JSON.stringify({ versionId: oldest.id }),
    });
    expect(restoreRes.ok()).toBeTruthy();

    const afterRes = await request.get(`${BASE}/api/pages/${pageId}/versions`, { headers });
    expect(afterRes.ok()).toBeTruthy();
    const afterData = await afterRes.json();
    expect(afterData?.current_version_id).toBe(oldest.id);

    const deployRes = await request.post(`${BASE}/api/pages/${pageId}/deploy`, {
      headers,
      data: JSON.stringify({ deploy: true }),
    });
    expect(deployRes.ok()).toBeTruthy();
    const deployData = await deployRes.json();
    expect(deployData?.deployed).toBe(true);
    expect(deployData?.deploy_url).toBeTruthy();

    const undeployRes = await request.post(`${BASE}/api/pages/${pageId}/deploy`, {
      headers,
      data: JSON.stringify({ deploy: false }),
    });
    expect(undeployRes.ok()).toBeTruthy();
    const undeployData = await undeployRes.json();
    expect(undeployData?.deployed).toBe(false);
    expect(undeployData?.deploy_url).toBeNull();
  });
});
