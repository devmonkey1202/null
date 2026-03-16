import { describe, expect, it } from "vitest";

import { applyEditedPathToShape, commitEditedPathShape, resolveEditablePathSource, resolveEditablePathSourceAtPoint } from "../src/advanced/geom/pathEditShape";
import { pathDataFromVectorPathId } from "../src/advanced/geom/vectorNetwork";

describe("path edit shape", () => {
  it("prefers editable segments over stale pathData when resolving the edit source", () => {
    const resolved = resolveEditablePathSource({
      pathData: "M 0 0 L 5 0 L 5 5 Z",
      segments: [
        { d: "M 10 10 L 20 10 L 20 20 Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
      ],
    });

    expect(resolved).toEqual({
      pathData: "M 10 10 L 20 10 L 20 20 Z",
      source: { kind: "segment", index: 0 },
    });
  });

  it("writes edits back into the matching segment and keeps single-segment pathData in sync", () => {
    const nextShape = applyEditedPathToShape(
      {
        pathData: "M 0 0 L 5 0 L 5 5 Z",
        segments: [
          { d: "M 10 10 L 20 10 L 20 20 Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
        ],
      },
      { kind: "segment", index: 0 },
      "M 1 1 L 9 1 L 9 9 Z",
    );

    expect(nextShape.pathData).toBe("M 1 1 L 9 1 L 9 9 Z");
    expect(nextShape.segments).toEqual([
      { d: "M 1 1 L 9 1 L 9 9 Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
    ]);
    expect(nextShape.vectorNetwork?.paths).toHaveLength(1);
  });

  it("drops stale pathData when editing one segment inside a multi-segment shape", () => {
    const nextShape = applyEditedPathToShape(
      {
        pathData: "M 0 0 L 5 0 L 5 5 Z",
        segments: [
          { d: "M 0 0 L 10 0 L 10 10 Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
          { d: "M 20 20 L 30 20 L 30 30 Z", fills: [{ type: "solid", color: "#00ff00", opacity: 1 }] },
        ],
      },
      { kind: "segment", index: 1 },
      "M 21 21 L 31 21 L 31 31 Z",
    );

    expect(nextShape.pathData).toBeUndefined();
    expect(nextShape.segments?.[0]).toEqual({
      d: "M 0 0 L 10 0 L 10 10 Z",
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
    expect(nextShape.segments?.[1]).toEqual({
      d: "M 21 21 L 31 21 L 31 31 Z",
      fills: [{ type: "solid", color: "#00ff00", opacity: 1 }],
    });
    expect(nextShape.vectorNetwork?.paths).toHaveLength(2);
  });

  it("picks the nearest segment when a multi-segment shape is opened for path editing", () => {
    const resolved = resolveEditablePathSourceAtPoint(
      {
        segments: [
          { d: "M 0 0 L 10 0 L 10 10 Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
          { d: "M 80 80 L 90 80 L 90 90 Z", fills: [{ type: "solid", color: "#00ff00", opacity: 1 }] },
        ],
      },
      { x: 100, y: 200 },
      { x: 185, y: 285 },
    );

    expect(resolved).toEqual({
      pathData: "M 80 80 L 90 80 L 90 90 Z",
      source: { kind: "segment", index: 1 },
    });
  });

  it("keeps vectorNetwork-only multi-path edits in vectorNetwork form", () => {
    const nextShape = applyEditedPathToShape(
      {
        vectorNetwork: {
          vertices: [
            { id: "a0", x: 0, y: 0 },
            { id: "a1", x: 10, y: 0 },
            { id: "a2", x: 10, y: 10 },
            { id: "b0", x: 80, y: 80 },
            { id: "b1", x: 90, y: 80 },
            { id: "b2", x: 90, y: 90 },
          ],
          segments: [
            { id: "as0", from: "a0", to: "a1" },
            { id: "as1", from: "a1", to: "a2" },
            { id: "as2", from: "a2", to: "a0" },
            { id: "bs0", from: "b0", to: "b1" },
            { id: "bs1", from: "b1", to: "b2" },
            { id: "bs2", from: "b2", to: "b0" },
          ],
          paths: [
            { id: "path_a", vertexIds: ["a0", "a1", "a2"], closed: true, fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
            { id: "path_b", vertexIds: ["b0", "b1", "b2"], closed: true, fills: [{ type: "solid", color: "#00ff00", opacity: 1 }] },
          ],
        },
      },
      { kind: "vectorPath", pathId: "path_b" },
      "M 81 81 L 91 81 L 91 91 Z",
    );

    expect(nextShape.pathData).toBeUndefined();
    expect(nextShape.segments).toBeUndefined();
    expect(nextShape.vectorNetwork?.paths).toHaveLength(2);
    expect(pathDataFromVectorPathId(nextShape.vectorNetwork, "path_a")).toBe("M 0 0 L 10 0 L 10 10 L 0 0 Z");
    expect(pathDataFromVectorPathId(nextShape.vectorNetwork, "path_b")).toBe("M 81 81 L 91 81 L 91 91 L 81 81 Z");
    expect(nextShape.vectorNetwork?.paths[0]).toMatchObject({
      id: "path_a",
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
    expect(nextShape.vectorNetwork?.paths[1]).toMatchObject({
      id: "path_b",
      fills: [{ type: "solid", color: "#00ff00", opacity: 1 }],
    });
  });

  it("preserves vector path fills when editing a single vectorNetwork-only path", () => {
    const nextShape = applyEditedPathToShape(
      {
        vectorNetwork: {
          vertices: [
            { id: "v0", x: 0, y: 0 },
            { id: "v1", x: 10, y: 0 },
            { id: "v2", x: 10, y: 10 },
          ],
          segments: [
            { id: "s0", from: "v0", to: "v1" },
            { id: "s1", from: "v1", to: "v2" },
            { id: "s2", from: "v2", to: "v0" },
          ],
          paths: [
            { id: "path_only", vertexIds: ["v0", "v1", "v2"], closed: true, fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
          ],
        },
      },
      { kind: "vectorPath", pathId: "path_only" },
      "M 1 1 L 9 1 L 9 9 Z",
    );

    expect(nextShape.pathData).toBeUndefined();
    expect(nextShape.segments).toBeUndefined();
    expect(nextShape.vectorNetwork?.paths).toHaveLength(1);
    expect(pathDataFromVectorPathId(nextShape.vectorNetwork, "path_only")).toBe("M 1 1 L 9 1 L 9 9 L 1 1 Z");
    expect(nextShape.vectorNetwork?.paths[0]).toMatchObject({
      id: "path_only",
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
  });

  it("recomputes the overall frame when editing one segment inside a multi-segment shape", () => {
    const committed = commitEditedPathShape(
      {
        segments: [
          { d: "M 0 0 L 10 0 L 10 10 Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
          { d: "M 40 40 L 50 40 L 50 50 Z", fills: [{ type: "solid", color: "#00ff00", opacity: 1 }] },
        ],
      },
      { x: 100, y: 200, w: 60, h: 60, rotation: 0 },
      { kind: "segment", index: 0 },
      "M 90 190 L 100 190 L 100 200 Z",
    );

    expect(committed.frame).toEqual({ x: 90, y: 190, w: 60, h: 60, rotation: 0 });
    expect(committed.shape.segments?.[0]).toEqual({
      d: "M 0 0 L 10 0 L 10 10 L 0 0 Z",
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
    expect(committed.shape.segments?.[1]).toEqual({
      d: "M 50 50 L 60 50 L 60 60 L 50 50 Z",
      fills: [{ type: "solid", color: "#00ff00", opacity: 1 }],
    });
  });

  it("keeps vectorNetwork-only commits as vectorNetwork-only while updating frame bounds", () => {
    const committed = commitEditedPathShape(
      {
        vectorNetwork: {
          vertices: [
            { id: "a0", x: 0, y: 0 },
            { id: "a1", x: 10, y: 0 },
            { id: "a2", x: 10, y: 10 },
            { id: "b0", x: 40, y: 40 },
            { id: "b1", x: 50, y: 40 },
            { id: "b2", x: 50, y: 50 },
          ],
          segments: [
            { id: "as0", from: "a0", to: "a1" },
            { id: "as1", from: "a1", to: "a2" },
            { id: "as2", from: "a2", to: "a0" },
            { id: "bs0", from: "b0", to: "b1" },
            { id: "bs1", from: "b1", to: "b2" },
            { id: "bs2", from: "b2", to: "b0" },
          ],
          paths: [
            { id: "path_a", vertexIds: ["a0", "a1", "a2"], closed: true, fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
            { id: "path_b", vertexIds: ["b0", "b1", "b2"], closed: true, fills: [{ type: "solid", color: "#00ff00", opacity: 1 }] },
          ],
        },
      },
      { x: 100, y: 200, w: 60, h: 60, rotation: 0 },
      { kind: "vectorPath", pathId: "path_b" },
      "M 90 190 L 100 190 L 100 200 Z",
    );

    expect(committed.frame).toEqual({ x: 90, y: 190, w: 20, h: 20, rotation: 0 });
    expect(committed.shape.pathData).toBeUndefined();
    expect(committed.shape.segments).toBeUndefined();
    expect(committed.shape.vectorNetwork?.paths).toHaveLength(2);
    expect(pathDataFromVectorPathId(committed.shape.vectorNetwork, "path_a")).toBe("M 10 10 L 20 10 L 20 20 L 10 10 Z");
    expect(pathDataFromVectorPathId(committed.shape.vectorNetwork, "path_b")).toBe("M 0 0 L 10 0 L 10 10 L 0 0 Z");
  });
});
