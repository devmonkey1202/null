import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://127.0.0.1:3101";
const BASE_ORIGIN = new URL(BASE_URL);
const REQUEST_TIMEOUT_MS = 120_000;
const DESKTOP_VIEWPORT = { width: 1440, height: 1080 };
const COMPACT_VIEWPORT = { width: 1100, height: 1080 };
const MOBILE_VIEWPORT = { width: 390, height: 1200 };
const TOP_CLIP_HEIGHT = 940;
const MOBILE_CLIP_HEIGHT = 1280;

type StarterResponse = {
  ok: true;
  pageId: string;
  publicUrl: string;
  validationUrl: string;
};

function ownerHeaders(anonId: string) {
  return {
    "x-anon-user-id": anonId,
    "Content-Type": "application/json",
  };
}

async function createIntegratedServiceProject(request: import("@playwright/test").APIRequestContext, anonId: string) {
  const response = await request.post("/api/pages/starters/integrated-service", {
    headers: ownerHeaders(anonId),
    timeout: REQUEST_TIMEOUT_MS,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as StarterResponse;
}

async function attachOwnerIdentity(page: import("@playwright/test").Page, anonId: string) {
  await page.context().addCookies([
    {
      name: "anon_user_id",
      value: anonId,
      domain: BASE_ORIGIN.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: BASE_ORIGIN.protocol === "https:",
    },
  ]);
  await page.addInitScript((value) => {
    window.localStorage.setItem("anon_user_id", value);
  }, anonId);
}

async function openPublicSurface(page: import("@playwright/test").Page, publicUrl: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto(publicUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await expect(page.locator("body")).toContainText("NULL 통합 검증 서비스");
}

async function openTab(page: import("@playwright/test").Page, label: string, readyText: string) {
  await page.getByText(label).first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator("body")).toContainText(readyText);
}

async function expectTopSnapshot(page: import("@playwright/test").Page, name: string, width: number, height = TOP_CLIP_HEIGHT) {
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
    clip: { x: 0, y: 0, width, height },
  });
}

test.describe.serial("integrated service visual regression", () => {
  test.setTimeout(180_000);

  test("public editor outputs stay visually stable across desktop and compact breakpoints", async ({ page, request }) => {
    const anonId = `anon_integrated_visual_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const starter = await createIntegratedServiceProject(request, anonId);

    await attachOwnerIdentity(page, anonId);

    await openPublicSurface(page, starter.publicUrl, DESKTOP_VIEWPORT);
    await expectTopSnapshot(page, "integrated-service-user-desktop.png", DESKTOP_VIEWPORT.width);

    await openTab(page, "파트너 포털", "승인 문서");
    await expectTopSnapshot(page, "integrated-service-partner-desktop.png", DESKTOP_VIEWPORT.width);

    await openTab(page, "운영 콘솔", "운영 텔레메트리");
    await expectTopSnapshot(page, "integrated-service-ops-desktop.png", DESKTOP_VIEWPORT.width);

    await openPublicSurface(page, starter.publicUrl, COMPACT_VIEWPORT);
    await expectTopSnapshot(page, "integrated-service-user-compact.png", COMPACT_VIEWPORT.width);

    await openTab(page, "파트너 포털", "승인 문서");
    await expectTopSnapshot(page, "integrated-service-partner-compact.png", COMPACT_VIEWPORT.width);

    await openTab(page, "운영 콘솔", "운영 텔레메트리");
    await expectTopSnapshot(page, "integrated-service-ops-compact.png", COMPACT_VIEWPORT.width);

    await openPublicSurface(page, starter.publicUrl, MOBILE_VIEWPORT);
    await expectTopSnapshot(page, "integrated-service-user-mobile.png", MOBILE_VIEWPORT.width, MOBILE_CLIP_HEIGHT);

    await openTab(page, "파트너 포털", "승인 문서");
    await expectTopSnapshot(page, "integrated-service-partner-mobile.png", MOBILE_VIEWPORT.width, MOBILE_CLIP_HEIGHT);

    await openTab(page, "운영 콘솔", "운영 텔레메트리");
    await expectTopSnapshot(page, "integrated-service-ops-mobile.png", MOBILE_VIEWPORT.width, MOBILE_CLIP_HEIGHT);
  });
});
