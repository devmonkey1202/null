import { test, expect } from "@playwright/test";

async function createAnonPage(page: import("@playwright/test").Page, title: string) {
  const anonId = `anon_workflow_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

test.describe.serial("workflow ui", () => {
  test.setTimeout(120_000);

  test("workflow panel shows api_call step reference", async ({ page }) => {
    const { pageId } = await createAnonPage(page, `Workflow UI ${Date.now()}`);

    await page.goto(`/editor/advanced?pageId=${pageId}&e2e=1`, { waitUntil: "domcontentloaded" });
    await page.waitForResponse((res) => res.url().includes(`/api/pages/${pageId}`) && res.status() === 200, {
      timeout: 20000,
    });

    const workflowTab = page.getByRole("button", { name: "워크플로우", exact: true });
    await workflowTab.click();

    await expect(page.getByText("스텝 타입 참고")).toBeVisible();
    await expect(page.getByText("api_call: url, method")).toBeVisible();
  });
});
