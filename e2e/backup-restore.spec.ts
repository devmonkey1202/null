import { test, expect } from "@playwright/test";

async function createAnonPage(request: import("@playwright/test").APIRequestContext, title: string) {
  const anonId = `anon_backup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const createRes = await request.post("/api/pages", {
    headers: { "x-anon-user-id": anonId, "Content-Type": "application/json" },
    data: { title, content: { width: 360, height: 640, nodes: [] } },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  const pageId = created?.pageId ?? created?.id;
  expect(pageId).toBeTruthy();
  return { pageId: String(pageId), anonId };
}

test.describe.serial("backup/restore", () => {
  test.setTimeout(120_000);

  test("exports and restores page backup", async ({ request }) => {
    const { pageId, anonId } = await createAnonPage(request, `Backup ${Date.now()}`);

    const backupRes = await request.get(`/api/pages/${pageId}/backup`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(backupRes.ok()).toBeTruthy();
    const backup = await backupRes.json();
    expect(backup.ok).toBe(true);
    expect(backup.page).toBeTruthy();

    const restoreRes = await request.post(`/api/pages/${pageId}/backup`, {
      headers: { "x-anon-user-id": anonId, "Content-Type": "application/json" },
      data: { backup },
    });
    expect(restoreRes.ok()).toBeTruthy();
    const restoreBody = await restoreRes.json();
    expect(restoreBody.ok).toBe(true);
  });
});
