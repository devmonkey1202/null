import { describe, expect, it } from "vitest";

import { MEDIA_PATTERN_BOX, getMediaPreserveAspectRatio, resolveImageFillLayout, resolveNodeMediaLayout } from "../src/advanced/geom/mediaLayout";

describe("media layout", () => {
  it("centers overflow by focal point for node media", () => {
    const layout = resolveNodeMediaLayout(200, 100, {
      fit: "cover",
      scale: 2,
      focalX: 1,
      focalY: 0,
    });

    expect(layout.imageWidth).toBe(400);
    expect(layout.imageHeight).toBe(200);
    expect(layout.imageX).toBe(-200);
    expect(layout.imageY).toBe(0);
    expect(layout.clipWidth).toBe(200);
    expect(layout.clipHeight).toBe(100);
  });

  it("respects crop windows for image fills", () => {
    const layout = resolveImageFillLayout(
      {
        type: "image",
        src: "https://example.com/image.png",
        fit: "contain",
        scale: 1.5,
        crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
        focalX: 0.25,
        focalY: 0.75,
      },
      MEDIA_PATTERN_BOX,
    );

    expect(layout.clipX).toBe(10);
    expect(layout.clipY).toBe(20);
    expect(layout.clipWidth).toBe(50);
    expect(layout.clipHeight).toBe(40);
    expect(layout.imageWidth).toBe(150);
    expect(layout.imageHeight).toBe(150);
    expect(layout.imageX).toBeCloseTo(-15);
    expect(layout.imageY).toBeCloseTo(-62.5);
  });

  it("maps fit plus focal to preserveAspectRatio keywords", () => {
    expect(getMediaPreserveAspectRatio("fill", 0.2, 0.8)).toBe("none");
    expect(getMediaPreserveAspectRatio("cover", 0, 1)).toBe("xMinYMax slice");
    expect(getMediaPreserveAspectRatio("contain", 0.5, 0.5)).toBe("xMidYMid meet");
  });
});
