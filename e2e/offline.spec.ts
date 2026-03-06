import { test, expect } from "@playwright/test";

test.describe.serial("offline cache mode", () => {
  test.setTimeout(120_000);

  test("shows offline fallback when network is unavailable", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.waitForFunction(() => "serviceWorker" in navigator);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Reload once to ensure the SW controls the page.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await page.context().setOffline(true);
    await page.goto("/some-offline-path", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("You're offline")).toBeVisible();

    await page.context().setOffline(false);
  });
});
