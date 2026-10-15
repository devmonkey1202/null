import { expect, test } from "@playwright/test";

test("v2 editor groups and ungroups a layer multi-selection through wasm", async ({ page }) => {
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.log(`[browser console] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => console.log(`[browser error] ${error.message}`));

  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  const brandOrb = layerPanel.getByRole("button", { name: /Brand Orb/ }).first();
  const pathDemo = layerPanel.getByRole("button", { name: /Path Demo/ }).first();

  await brandOrb.click();
  await pathDemo.click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 layers selected", { exact: true })).toBeVisible();

  const groupButton = inspector.getByRole("button", { name: "Group", exact: true });
  await expect(groupButton).toBeEnabled();
  await groupButton.click();

  await expect(page.getByText("1 layer selected", { exact: true })).toBeVisible();
  await expect(layerPanel.getByRole("button", { name: /Group\s+group/i })).toBeVisible();

  const ungroupButton = inspector.getByRole("button", { name: "Ungroup", exact: true });
  await expect(ungroupButton).toBeEnabled();
  await ungroupButton.click();

  await expect(page.getByText("2 layers selected", { exact: true })).toBeVisible();
  await expect(brandOrb).toBeVisible();
  await expect(pathDemo).toBeVisible();
});
