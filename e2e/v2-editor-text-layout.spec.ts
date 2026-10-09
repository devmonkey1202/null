import { expect, test } from "@playwright/test";

test("v2 editor measures unicode text and auto height through wasm", async ({ page }) => {
  page.on("pageerror", (error) => console.log(`[browser error] ${error.message}`));

  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check("16px Inter");
      }),
    )
    .toBe(true);

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  const titleLayer = layerPanel.getByRole("button", { name: /Title/ }).first();
  const titleNode = page.locator('[data-editor-node-id="hero-title"]');

  await titleLayer.click();
  const summary = inspector.getByTestId("v2-text-layout-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("1 line");
  await expect(summary).toContainText("font shaped");

  const content = "가나다라마바사🙂\na\u0301";
  const contentEditor = inspector.locator("textarea").first();
  await contentEditor.fill(content);

  await expect(contentEditor).toHaveValue(content);
  await expect(summary).toContainText("2 lines");
  await expect(summary).toContainText("9 graphemes");
  await expect(summary).toContainText("8 fallback");
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
  await expect(summary).toContainText("font shaped");
  await expect(summary).toContainText("52 px");
});

test("v2 editor exposes bidi layout diagnostics from wasm", async ({ page }) => {
  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  await layerPanel.getByRole("button", { name: /Title/ }).first().click();

  const summary = inspector.getByTestId("v2-text-layout-summary");
  const contentEditor = inspector.locator("textarea").first();
  await contentEditor.fill("abc אבג def");

  await expect(contentEditor).toHaveValue("abc אבג def");
  await expect(summary).toContainText("1 bidi");
  await expect(summary).toContainText("fallback");
  await expect(inspector.getByTestId("v2-text-measurement-mode")).toHaveAttribute(
    "title",
    /RTL glyph shaping\/render integration pending/,
  );
  await expect(
    page.locator('[data-editor-node-id="hero-title"] [dir="auto"]').first(),
  ).toBeVisible();
});
