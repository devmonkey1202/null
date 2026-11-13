import { expect, test } from "@playwright/test";

test("v2 editor builds and incrementally diffs Rust render commands", async ({ page }) => {
  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const renderSummary = page.getByTestId("v2-render-list-summary");
  await expect(renderSummary).toBeVisible();
  await expect
    .poll(async () => Number(await renderSummary.getAttribute("data-command-count")))
    .toBeGreaterThan(5);
  await expect
    .poll(async () => Number(await renderSummary.getAttribute("data-glyph-count")))
    .toBeGreaterThan(20);
  await expect(renderSummary).toHaveAttribute("data-render-issue-count", "0");

  const initialRevision = await renderSummary.getAttribute("data-render-revision");
  expect(initialRevision).toMatch(/^[0-9a-f]{16}$/);

  const layerPanel = page.locator("aside").first();
  const inspector = page.locator("aside").last();
  await layerPanel.getByRole("button", { name: /Title/ }).first().click();
  const contentEditor = inspector.locator("textarea").first();
  await contentEditor.fill("Design systems. Ship precisely.");
  await expect(contentEditor).toHaveValue("Design systems. Ship precisely.");

  await expect
    .poll(() => renderSummary.getAttribute("data-render-revision"))
    .not.toBe(initialRevision);
  const diffSummary = page.getByTestId("v2-render-diff-summary");
  await expect(diffSummary).toBeVisible();
  await expect
    .poll(async () => {
      const added = Number(await diffSummary.getAttribute("data-added-count"));
      const updated = Number(await diffSummary.getAttribute("data-updated-count"));
      return added + updated;
    })
    .toBeGreaterThan(0);
  await expect(diffSummary).toHaveAttribute("data-removed-count", "0");
});
