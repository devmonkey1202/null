import { describe, expect, it } from "vitest";

import { createNode } from "../src/advanced/doc/scene";
import { buildBooleanOperandSnapshotFromNode } from "../src/advanced/geom/booleanTrace";
import { pathDataFromVectorNetwork, withDerivedVectorNetwork } from "../src/advanced/geom/vectorNetwork";

describe("boolean trace", () => {
  it("captures local path, frame, and fills for rect operands", () => {
    const node = createNode("rect", {
      id: "rect_1",
      name: "Rect Operand",
      frame: { x: 50, y: 60, w: 80, h: 40, rotation: 0 },
      style: {
        fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
        strokes: [],
        effects: [],
        opacity: 1,
        blendMode: "normal",
      },
    });

    const snapshot = buildBooleanOperandSnapshotFromNode(
      node,
      { x: 50, y: 60, w: 80, h: 40, rotation: 0 },
      { x: 40, y: 50 },
    );

    expect(snapshot).toMatchObject({
      sourceId: "rect_1",
      name: "Rect Operand",
      type: "rect",
      frame: { x: 10, y: 10, w: 80, h: 40, rotation: 0 },
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
    expect(snapshot?.pathData).toBe("M 10 10 L 90 10 L 90 50 L 10 50 L 10 10 Z");
    expect(pathDataFromVectorNetwork(snapshot?.vectorNetwork)).toBe("M 10 10 L 90 10 L 90 50 L 10 50 L 10 10 Z");
  });

  it("uses primary path data fallback for path operands", () => {
    const node = createNode("path", {
      id: "path_1",
      name: "Curve Operand",
      frame: { x: 80, y: 90, w: 20, h: 10, rotation: 0 },
      shape: withDerivedVectorNetwork({ pathData: "M 0 0 C 10 0 10 10 20 10 Z" }),
    });

    node.shape = {
      vectorNetwork: node.shape?.vectorNetwork,
    };

    const snapshot = buildBooleanOperandSnapshotFromNode(
      node,
      { x: 80, y: 90, w: 20, h: 10, rotation: 0 },
      { x: 70, y: 80 },
    );

    expect(snapshot?.pathData).toContain("M 10 10 C 20 10 20 20 30 20");
    expect(snapshot?.pathData?.trim().endsWith("Z")).toBe(true);
    expect(snapshot?.frame).toEqual({ x: 10, y: 10, w: 20, h: 10, rotation: 0 });
    expect(snapshot?.vectorNetwork?.vertices[0]).toMatchObject({
      x: 10,
      y: 10,
      handleOutX: 20,
      handleOutY: 10,
    });
    expect(pathDataFromVectorNetwork(snapshot?.vectorNetwork)).toContain("M 10 10 C 20 10 20 20 30 20");
  });
});
