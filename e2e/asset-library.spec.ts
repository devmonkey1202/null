import { test, expect } from "@playwright/test";
import { Buffer } from "buffer";

type EditorBridge = {
  insertPresetById: (id: string) => void;
  getNodeCount: () => number;
};

declare global {
  interface Window {
    __ADVANCED_EDITOR__?: EditorBridge;
  }
}

const ASSET_TAB_LABEL = "자산";
const SAMPLE_PRESET_IDS = [
  "asset-onboarding-swipe",
  "asset-permission-request",
  "asset-profile-edit",
  "asset-search-home",
  "asset-content-feed",
  "asset-chat-room",
  "asset-kpi-cards",
  "asset-form-wizard",
];

async function createAnonPage(page: import("@playwright/test").Page, title: string) {
  const anonId = `anon_asset_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

async function openAssetsTab(leftPanel: ReturnType<import("@playwright/test").Page["locator"]>) {
  const tabButton = leftPanel.getByRole("button", { name: ASSET_TAB_LABEL, exact: true });
  await tabButton.click();
}

test.describe.serial("asset library presets", () => {
  test.setTimeout(20 * 60 * 1000);

  test("sample presets are insertable (UI)", async ({ page }) => {
    const { pageId } = await createAnonPage(page, `Asset Sample ${Date.now()}`);

    await page.goto(`/editor/advanced?pageId=${pageId}&e2e=1`, { waitUntil: "domcontentloaded" });
    await page.waitForResponse((res) => res.url().includes(`/api/pages/${pageId}`) && res.status() === 200, {
      timeout: 20000,
    });
    const leftPanel = page.locator("aside");

    await openAssetsTab(leftPanel);
    await page.waitForFunction(() => Boolean(window.__ADVANCED_EDITOR__), null, { timeout: 10000 });
    const hasBridge = await page.evaluate(() => Boolean(window.__ADVANCED_EDITOR__));
    expect(hasBridge, "E2E bridge missing. Start dev server with NEXT_PUBLIC_E2E=1.").toBeTruthy();

    await page.waitForTimeout(200);
    let lastCount = await page.evaluate(() => window.__ADVANCED_EDITOR__!.getNodeCount());

    for (const presetId of SAMPLE_PRESET_IDS) {
      const inserted = await page.evaluate((id) => window.__ADVANCED_EDITOR__!.insertPresetById(id), presetId);
      expect(inserted, `preset insert failed: ${presetId}`).toBeTruthy();
      await page.waitForFunction((prev) => window.__ADVANCED_EDITOR__!.getNodeCount() > prev, lastCount, {
        timeout: 10000,
      });
      lastCount = await page.evaluate(() => window.__ADVANCED_EDITOR__!.getNodeCount());
    }
  });

  test("all presets are insertable (UI full)", async ({ page }) => {
    if (process.env.FULL_PRESET_INSERT !== "1") {
      test.skip(true, "FULL_PRESET_INSERT is not enabled");
    }
    const { pageId } = await createAnonPage(page, `Asset Full ${Date.now()}`);

    await page.goto(`/editor/advanced?pageId=${pageId}&e2e=1`, { waitUntil: "domcontentloaded" });
    await page.waitForResponse((res) => res.url().includes(`/api/pages/${pageId}`) && res.status() === 200, {
      timeout: 20000,
    });
    const leftPanel = page.locator("aside");

    await openAssetsTab(leftPanel);
    const presetIds = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("[data-preset-id]"));
      const ids = nodes
        .map((node) => node.getAttribute("data-preset-id"))
        .filter((id): id is string => Boolean(id));
      return Array.from(new Set(ids));
    });
    expect(presetIds.length, "no preset ids found in UI").toBeGreaterThan(0);

    await page.waitForFunction(() => Boolean(window.__ADVANCED_EDITOR__), null, { timeout: 10000 });
    const hasBridge = await page.evaluate(() => Boolean(window.__ADVANCED_EDITOR__));
    expect(hasBridge, "E2E bridge missing. Start dev server with NEXT_PUBLIC_E2E=1.").toBeTruthy();

    let lastCount = await page.evaluate(() => window.__ADVANCED_EDITOR__!.getNodeCount());
    const failures: string[] = [];
    const batchSize = 10;
    for (let i = 0; i < presetIds.length; i += batchSize) {
      const batch = presetIds.slice(i, i + batchSize);
      const results = await page.evaluate((ids) => ids.map((id) => window.__ADVANCED_EDITOR__!.insertPresetById(id)), batch);
      results.forEach((ok, idx) => {
        if (!ok) failures.push(batch[idx]);
      });
      await page.waitForFunction((prev) => window.__ADVANCED_EDITOR__!.getNodeCount() > prev, lastCount, {
        timeout: 20000,
      });
      lastCount = await page.evaluate(() => window.__ADVANCED_EDITOR__!.getNodeCount());
    }

    expect(failures, `preset insert failed: ${failures.join(", ")}`).toEqual([]);
  });

  test("core flow: editor -> publish -> live -> replay", async ({ page }) => {
    const { pageId, anonId } = await createAnonPage(page, `Core Flow ${Date.now()}`);

    await page.goto(`/editor/advanced?pageId=${pageId}&e2e=1`, { waitUntil: "domcontentloaded" });
    const leftPanel = page.locator("aside");
    await openAssetsTab(leftPanel);
    const commentPreset = leftPanel.locator('[data-preset-id="asset-content-comment-thread"]').first();
    await commentPreset.scrollIntoViewIfNeeded();
    await commentPreset.click();
    await page.waitForSelector("[data-nodeid]", { timeout: 10000 });

    const publishRes = await page.request.post(`/api/pages/${pageId}/publish`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(publishRes.ok()).toBeTruthy();

    await page.goto(`/live/${pageId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("section")).toBeVisible();

    await page.goto(`/replay/${pageId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
  });

  test("asset library backend endpoints", async ({ page }) => {
    const { pageId, anonId } = await createAnonPage(page, `Asset Endpoints ${Date.now()}`);

    const publishRes = await page.request.post(`/api/pages/${pageId}/publish`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(publishRes.ok()).toBeTruthy();

    const commentRes = await page.request.post(`/api/pages/${pageId}/comments`, {
      headers: { "x-anon-user-id": anonId, "Content-Type": "application/json" },
      data: { content: "test comment" },
    });
    expect(commentRes.ok()).toBeTruthy();
    const commentData = await commentRes.json();
    const commentId = commentData?.comment?.id;
    expect(commentId).toBeTruthy();

    const updateRes = await page.request.patch(`/api/pages/${pageId}/comments/${commentId}`, {
      headers: { "x-anon-user-id": anonId, "Content-Type": "application/json" },
      data: { content: "updated comment" },
    });
    expect(updateRes.ok()).toBeTruthy();

    const deleteRes = await page.request.delete(`/api/pages/${pageId}/comments/${commentId}`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(deleteRes.ok()).toBeTruthy();

    const reportRes = await page.request.post(`/api/pages/${pageId}/report`, {
      headers: { "x-anon-user-id": anonId, "Content-Type": "application/json" },
      data: { reason: "test report" },
    });
    expect(reportRes.ok()).toBeTruthy();

    const upvoteRes = await page.request.post(`/api/pages/${pageId}/upvote`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(upvoteRes.ok()).toBeTruthy();

    const removeUpvoteRes = await page.request.delete(`/api/pages/${pageId}/upvote`, {
      headers: { "x-anon-user-id": anonId },
    });
    expect(removeUpvoteRes.ok()).toBeTruthy();

    const uploadRes = await page.request.post(`/api/app/${pageId}/upload`, {
      headers: { "x-anon-user-id": anonId },
      multipart: {
        file: {
          name: "test.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("upload test"),
        },
      },
    });
    expect(uploadRes.ok()).toBeTruthy();

    const billingRes = await page.request.post(`/api/billing/upgrade`, {
      headers: { "x-anon-user-id": anonId, "Content-Type": "application/json" },
      data: { targetPlan: "pro" },
    });
    expect(billingRes.ok()).toBeTruthy();
  });
});
