import { expect, test } from "@playwright/test";

test("v2 editor submits Rust render commands to the WebGL2 shadow backend", async ({ page }) => {
  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("kernel: rust-wasm", { exact: true })).toBeVisible();

  const renderSummary = page.getByTestId("v2-render-list-summary");
  const surface = page.getByTestId("v2-webgl-render-surface");
  await expect(surface).toHaveAttribute("data-backend", "webgl2");
  await expect(surface).toHaveAttribute("data-available", "true");
  await expect(surface).toHaveAttribute("data-context-lost", "false");
  await expect(surface).toHaveAttribute("data-gl-error", "0");
  await expect(surface).toHaveAttribute("data-invalid-paint-count", "0");
  await expect
    .poll(async () => Number(await surface.getAttribute("data-instance-count")))
    .toBeGreaterThan(2);
  await expect(surface).toHaveAttribute("data-draw-call-count", "1");
  await expect
    .poll(async () => Number(await surface.getAttribute("data-unsupported-command-count")))
    .toBeGreaterThan(0);

  await expect
    .poll(async () => {
      const rustRevision = await renderSummary.getAttribute("data-render-revision");
      const gpuRevision = await surface.getAttribute("data-render-revision");
      return Boolean(rustRevision?.match(/^[0-9a-f]{16}$/) && rustRevision === gpuRevision);
    })
    .toBe(true);

  const diagnostics = await page.evaluate(() => {
    const rust = document.querySelector<HTMLElement>("[data-testid='v2-render-list-summary']");
    const gpu = document.querySelector<HTMLCanvasElement>("[data-testid='v2-webgl-render-surface']");
    const gl = gpu?.getContext("webgl2");
    return {
      sameRevision: rust?.dataset.renderRevision === gpu?.dataset.renderRevision,
      contextAvailable: Boolean(gl),
      glError: gl?.getError() ?? -1,
    };
  });
  expect(diagnostics).toEqual({ sameRevision: true, contextAvailable: true, glError: 0 });

  const renderedPixelSamples = await page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>(
      "[data-testid='v2-webgl-render-surface']",
    );
    if (!source || source.width === 0 || source.height === 0) {
      return 0;
    }
    const probe = document.createElement("canvas");
    probe.width = source.width;
    probe.height = source.height;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return 0;
    }
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let samples = 0;
    for (let index = 3; index < pixels.length; index += 64) {
      if (pixels[index] > 0) {
        samples += 1;
      }
    }
    return samples;
  });
  expect(renderedPixelSamples).toBeGreaterThan(100);
});

test("v2 WebGL2 backend recovers its resources after context restoration", async ({ page }) => {
  await page.goto("/editor/v2", { waitUntil: "domcontentloaded" });
  const surface = page.getByTestId("v2-webgl-render-surface");
  await expect(surface).toHaveAttribute("data-available", "true");

  const lossExtensionAvailable = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "[data-testid='v2-webgl-render-surface']",
    );
    const extension = canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    (
      window as typeof window & {
        __nullWebGlLossExtension?: WEBGL_lose_context;
      }
    ).__nullWebGlLossExtension = extension ?? undefined;
    extension?.loseContext();
    return Boolean(extension);
  });
  expect(lossExtensionAvailable).toBe(true);
  await expect(surface).toHaveAttribute("data-context-lost", "true");
  await expect(surface).toHaveAttribute("data-available", "false");

  await page.evaluate(() => {
    (
      window as typeof window & {
        __nullWebGlLossExtension?: WEBGL_lose_context;
      }
    ).__nullWebGlLossExtension?.restoreContext();
  });
  await expect(surface).toHaveAttribute("data-context-lost", "false");
  await expect(surface).toHaveAttribute("data-available", "true");
  await expect(surface).toHaveAttribute("data-draw-call-count", "1");
  await expect(surface).toHaveAttribute("data-gl-error", "0");
});
