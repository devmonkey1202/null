import { expect, test } from "@playwright/test";

test("v2 editor measures unicode text and auto height through wasm", async ({ page }) => {
  page.on("pageerror", (error) => console.log(`[browser error] ${error.message}`));
  const loadedEditorFonts = new Set<string>();
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith("/v2/fonts/") && pathname.endsWith(".ttf") && response.ok()) {
      loadedEditorFonts.add(pathname);
    }
  });

  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();
  await expect
    .poll(() => loadedEditorFonts.size)
    .toBe(4);
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
  await expect(summary).toContainText("3 scripts");
  await expect(summary).toContainText("font shaped");
  await expect(inspector.getByTestId("v2-text-measurement-mode")).toHaveAttribute(
    "title",
    /Noto Sans Hebrew/,
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('16px "Noto Sans Hebrew"', "אבג");
      }),
    )
    .toBe(true);
  await expect(
    page.locator('[data-editor-node-id="hero-title"] [dir="auto"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-editor-node-id="hero-title"] [dir="auto"] span').first(),
  ).toHaveCSS("font-family", /Noto Sans Hebrew/);
});

test("v2 editor reuses exact text layouts through the wasm cache", async ({ page }) => {
  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  const summary = inspector.getByTestId("v2-text-layout-summary");
  const titleLayer = layerPanel.getByRole("button", { name: /Title/ }).first();
  const descriptionLayer = layerPanel.getByRole("button", { name: /Description/ }).first();

  await titleLayer.click();
  await expect(summary).toBeVisible();
  await descriptionLayer.click();
  await expect(inspector.locator("textarea").first()).toHaveValue(/NULL v2 editor rebuild/);
  await titleLayer.click();

  await expect(summary).toContainText("cached");
});

test("v2 editor reuses unchanged paragraph shaping after a local edit", async ({ page }) => {
  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  await layerPanel.getByRole("button", { name: /Title/ }).first().click();

  const summary = inspector.getByTestId("v2-text-layout-summary");
  const contentEditor = inspector.locator("textarea").first();
  await contentEditor.fill("First paragraph\nStable paragraph\nThird paragraph");
  await expect(contentEditor).toHaveValue("First paragraph\nStable paragraph\nThird paragraph");
  await expect(summary).toContainText("3 lines");

  await contentEditor.fill("Alter paragraph\nStable paragraph\nThird paragraph");

  await expect(contentEditor).toHaveValue(
    "Alter paragraph\nStable paragraph\nThird paragraph",
  );
  await expect(summary).toContainText("2 paragraphs reused");
  await expect(summary).toContainText("font shaped");
});

test("v2 editor shapes Arabic with a dynamically registered script fallback", async ({ page }) => {
  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  await layerPanel.getByRole("button", { name: /Title/ }).first().click();

  const summary = inspector.getByTestId("v2-text-layout-summary");
  const contentEditor = inspector.locator("textarea").first();
  await contentEditor.fill("مرحبا بالعالم");

  await expect(contentEditor).toHaveValue("مرحبا بالعالم");
  await expect(summary).toContainText("1 bidi");
  await expect(summary).toContainText("1 scripts");
  await expect(summary).toContainText("font shaped");
  await expect(inspector.getByTestId("v2-text-measurement-mode")).toHaveAttribute(
    "title",
    /Noto Sans Arabic/,
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('16px "Noto Sans Arabic"', "مرحبا");
      }),
    )
    .toBe(true);
  await expect(
    page.locator('[data-editor-node-id="hero-title"] [dir="auto"] span').first(),
  ).toHaveCSS("font-family", /Noto Sans Arabic/);
});
