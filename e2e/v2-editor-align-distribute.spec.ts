import { expect, test, type Locator } from "@playwright/test";

type Frame = { x: number; y: number; w: number; h: number };

async function readFrame(locator: Locator): Promise<Frame> {
  return locator.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    return {
      x: Number.parseFloat(htmlElement.style.left),
      y: Number.parseFloat(htmlElement.style.top),
      w: Number.parseFloat(htmlElement.style.width),
      h: Number.parseFloat(htmlElement.style.height),
    };
  });
}

test("v2 editor aligns, distributes, nudges, and undoes through wasm", async ({ page }) => {
  page.on("pageerror", (error) => console.log(`[browser error] ${error.message}`));

  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  const brandLayer = layerPanel.getByRole("button", { name: /Brand Orb/ }).first();
  const pathLayer = layerPanel.getByRole("button", { name: /Path Demo/ }).first();
  const inspectorLayer = layerPanel.getByRole("button", { name: /Inspector Demo/ }).first();
  const brandNode = page.locator('[data-editor-node-id="shape-demo"]');
  const pathNode = page.locator('[data-editor-node-id="path-demo"]');
  const inspectorNode = page.locator('[data-editor-node-id="sidebar-frame"]');

  await brandLayer.click();
  await pathLayer.click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 layers selected", { exact: true })).toBeVisible();

  const brandBeforeAlign = await readFrame(brandNode);
  await inspector.getByRole("button", { name: "Align horizontal centers", exact: true }).click();
  const brandAfterAlign = await readFrame(brandNode);
  const pathAfterAlign = await readFrame(pathNode);
  expect(brandAfterAlign.x).not.toBe(brandBeforeAlign.x);
  expect(brandAfterAlign.x + brandAfterAlign.w / 2).toBeCloseTo(
    pathAfterAlign.x + pathAfterAlign.w / 2,
    4,
  );

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await readFrame(brandNode)).x).toBeCloseTo(brandBeforeAlign.x, 4);

  await inspectorLayer.click({ modifiers: ["Shift"] });
  await expect(page.getByText("3 layers selected", { exact: true })).toBeVisible();
  await inspector.getByRole("button", { name: "Distribute horizontal spacing", exact: true }).click();

  const brandDistributed = await readFrame(brandNode);
  const pathDistributed = await readFrame(pathNode);
  const inspectorDistributed = await readFrame(inspectorNode);
  const firstGap = pathDistributed.x - (brandDistributed.x + brandDistributed.w);
  const secondGap = inspectorDistributed.x - (pathDistributed.x + pathDistributed.w);
  expect(firstGap).toBeCloseTo(secondGap, 4);

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await readFrame(brandNode)).x).toBeCloseTo(brandDistributed.x + 1, 4);
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => (await readFrame(brandNode)).y).toBeCloseTo(brandDistributed.y + 10, 4);

  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await readFrame(brandNode)).x).toBeCloseTo(brandDistributed.x, 4);
  await expect.poll(async () => (await readFrame(brandNode)).y).toBeCloseTo(brandDistributed.y, 4);
});
