import { expect, test } from "@playwright/test";

test("v2 editor measures unicode text and auto height through wasm", async ({ page }) => {
  page.on("pageerror", (error) => console.log(`[browser error] ${error.message}`));

  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  const titleLayer = layerPanel.getByRole("button", { name: /Title/ }).first();
  const titleNode = page.locator('[data-editor-node-id="hero-title"]');

  await titleLayer.click();
  const summary = inspector.getByTestId("v2-text-layout-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("1 line");
  await expect(summary).toContainText("fallback metrics");

  const content = "가나다라마바사🙂\na\u0301";
  const contentEditor = inspector.locator("textarea").first();
  await contentEditor.fill(content);

  await expect(contentEditor).toHaveValue(content);
  await expect(summary).toContainText("2 lines");
  await expect(summary).toContainText("9 graphemes");
  await expect(summary).toContainText("104 px");
  await expect
    .poll(() =>
      titleNode.evaluate((element) => Number.parseFloat((element as HTMLElement).style.height)),
    )
    .toBeCloseTo(104, 4);

  await titleLayer.click();
  await page.keyboard.press("Control+z");
  await expect(contentEditor).toHaveValue("Design faster. Ship clearer.");
  await expect(summary).toContainText("1 line");
  await expect(summary).toContainText("52 px");
});
