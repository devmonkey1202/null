import { describe, expect, it } from "vitest";

import { formatRotationDegrees, normalizeRotationDegrees, parseRotationInput, roundRotationDegrees } from "@/advanced/ui/rotationMath";

describe("rotationMath", () => {
  it("normalizes rotation into the editor range with decimal precision", () => {
    expect(normalizeRotationDegrees(540.06)).toBe(-179.9);
    expect(normalizeRotationDegrees(-540.04)).toBe(180);
    expect(normalizeRotationDegrees(721.26)).toBe(1.3);
  });

  it("rounds rotation to the configured step", () => {
    expect(roundRotationDegrees(12.34)).toBe(12.3);
    expect(roundRotationDegrees(12.36)).toBe(12.4);
  });

  it("formats normalized rotation for geometry inputs", () => {
    expect(formatRotationDegrees(405)).toBe("45");
    expect(formatRotationDegrees(-180.04)).toBe("180");
    expect(formatRotationDegrees(22.5)).toBe("22.5");
  });

  it("parses and normalizes valid input while rejecting incomplete values", () => {
    expect(parseRotationInput(" 450.14 ")).toBe(90.1);
    expect(parseRotationInput("")).toBeNull();
    expect(parseRotationInput("nope")).toBeNull();
  });
});
