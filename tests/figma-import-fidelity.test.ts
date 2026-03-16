import { describe, expect, it } from "vitest";

import type { FigmaNode } from "../src/lib/figma";
import { getImportFidelityDecision } from "../src/lib/figmaImportFidelity";

describe("figma import fidelity", () => {
  it("keeps simple vector geometry editable", () => {
    const decision = getImportFidelityDecision({
      id: "1:0",
      name: "Vector",
      type: "VECTOR",
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
      fillGeometry: [{ path: "M0 0L10 0L10 10Z" }],
      children: [],
    } as FigmaNode);

    expect(decision).toEqual({
      renderAsImage: false,
      editablePath: true,
      editableMask: false,
      reasons: ["editable-path"],
    });
  });

  it("routes unsupported vector fills to image fallback", () => {
    const decision = getImportFidelityDecision({
      id: "2:0",
      name: "Gradient Vector",
      type: "VECTOR",
      fills: [{ type: "GRADIENT_RADIAL", gradientStops: [], gradientHandlePositions: [] }],
      fillGeometry: [{ path: "M0 0L10 0L10 10Z" }],
      children: [],
    } as FigmaNode);

    expect(decision.renderAsImage).toBe(true);
    expect(decision.editablePath).toBe(false);
    expect(decision.reasons).toEqual(expect.arrayContaining(["complex-gradient", "unsupported-geometry"]));
  });

  it("keeps a simple single-mask chain editable", () => {
    const decision = getImportFidelityDecision({
      id: "3:0",
      name: "Masked Frame",
      type: "FRAME",
      children: [
        {
          id: "3:1",
          name: "Mask",
          type: "RECTANGLE",
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
          isMask: true,
          children: [],
        },
        {
          id: "3:2",
          name: "Content",
          type: "RECTANGLE",
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
          children: [],
        },
      ],
    } as FigmaNode);

    expect(decision.renderAsImage).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  it("keeps multiple simple mask bands editable", () => {
    const decision = getImportFidelityDecision({
      id: "3:5",
      name: "Multi Masked Frame",
      type: "FRAME",
      children: [
        {
          id: "3:6",
          name: "Mask A",
          type: "RECTANGLE",
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
          isMask: true,
          children: [],
        },
        {
          id: "3:7",
          name: "Fill A",
          type: "RECTANGLE",
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
          children: [],
        },
        {
          id: "3:8",
          name: "Mask B",
          type: "ELLIPSE",
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
          isMask: true,
          children: [],
        },
        {
          id: "3:9",
          name: "Fill B",
          type: "RECTANGLE",
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 } }],
          children: [],
        },
      ],
    } as FigmaNode);

    expect(decision.renderAsImage).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  it("pushes complex descendant groups to image fallback", () => {
    const decision = getImportFidelityDecision({
      id: "4:0",
      name: "Complex Group",
      type: "GROUP",
      children: [
        {
          id: "4:1",
          name: "Unsupported Vector",
          type: "VECTOR",
          children: [],
        },
      ],
    } as FigmaNode);

    expect(decision.renderAsImage).toBe(true);
    expect(decision.reasons).toEqual(expect.arrayContaining(["complex-descendant"]));
  });
});
