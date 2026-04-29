import { describe, expect, it } from "vitest";

import { analyzeScreenshotPixels, buildScreenshotDocFromAnalysis } from "../src/lib/screenshotToNull";

function createSolidPixelData(width: number, height: number, color: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3];
  }
  return data;
}

describe("screenshotToNull", () => {
  it("detects foreground regions from screenshot pixels", () => {
    const width = 24;
    const height = 16;
    const data = createSolidPixelData(width, height, [255, 255, 255, 255]);

    for (let y = 4; y < 8; y += 1) {
      for (let x = 3; x < 20; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 24;
        data[offset + 1] = 24;
        data[offset + 2] = 24;
        data[offset + 3] = 255;
      }
    }

    const analysis = analyzeScreenshotPixels({ width, height, data });
    expect(analysis.background).toBe("#ffffff");
    expect(analysis.regions.length).toBeGreaterThan(0);
    expect(analysis.regions.some((region) => region.w >= 12 && region.h >= 3)).toBe(true);
  });

  it("builds an editable document from screenshot analysis", () => {
    const result = buildScreenshotDocFromAnalysis({
      fileName: "hero-shot.png",
      viewportId: "tablet",
      analysis: {
        width: 400,
        height: 240,
        background: "#f5f5f5",
        regions: [],
      },
      regions: [
        {
          x: 32,
          y: 24,
          w: 140,
          h: 30,
          kind: "text",
          fill: "#ffffff",
          foreground: "#111111",
          density: 0.22,
          variance: 42,
          text: "Hello NULL",
        },
        {
          x: 32,
          y: 72,
          w: 120,
          h: 48,
          kind: "rect",
          fill: "#2563eb",
          foreground: "#ffffff",
          density: 0.84,
          variance: 12,
        },
        {
          x: 188,
          y: 24,
          w: 144,
          h: 144,
          kind: "image",
          fill: "#d4d4d4",
          foreground: "#111111",
          density: 0.66,
          variance: 64,
          imageSrc: "data:image/png;base64,ZmFrZQ==",
        },
      ],
    });

    expect(result.importSource.kind).toBe("screenshot-file");
    expect(result.importSource.viewportId).toBe("tablet");
    expect(result.doc.imports?.web?.kind).toBe("screenshot-file");

    const nodes = Object.values(result.doc.nodes);
    expect(nodes.some((node) => node.type === "text" && node.text?.value === "Hello NULL")).toBe(true);
    expect(nodes.some((node) => node.type === "rect")).toBe(true);
    expect(
      nodes.some((node) => node.type === "image" && node.image?.src === "data:image/png;base64,ZmFrZQ=="),
    ).toBe(true);
  });
});
