import { describe, expect, it } from "vitest";

import type {
  RenderItem,
  RenderList,
  RenderPaint,
  RenderTransform,
} from "@/v2/editor/contracts";
import {
  buildWebGlDrawPlan,
  buildWebGlPrimitiveBatch,
  parseRenderColor,
  WEBGL_INSTANCE_FLOATS,
} from "@/v2/editor/render-batches";

const IDENTITY: RenderTransform = {
  m11: 1,
  m12: 0,
  m21: 0,
  m22: 1,
  dx: 0,
  dy: 0,
};

const PAINT: RenderPaint = {
  fill: "#2859ff",
  stroke: "rgba(15, 23, 42, 0.5)",
  strokeWidth: 2,
  opacity: 0.8,
};

function item(
  commandId: string,
  zIndex: number,
  primitive: RenderItem["primitive"],
  transform: RenderTransform = IDENTITY,
): RenderItem {
  return {
    commandId,
    nodeId: commandId.split(":")[0],
    zIndex,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    transform,
    fingerprint: commandId,
    primitive,
  };
}

function renderList(items: RenderItem[]): RenderList {
  return {
    version: 2,
    pageId: "page-1",
    revision: "0123456789abcdef",
    viewport: { x: 0, y: 0, width: 800, height: 600, scale: 1, overscan: 64 },
    items,
    issues: [],
    stats: {
      visitedNodes: items.length,
      drawableNodes: items.length,
      visibleNodes: items.length,
      culledNodes: 0,
      commandCount: items.length,
      glyphCount: 0,
      textRunCount: 0,
      pathCount: 0,
      vectorVertexCount: 0,
      vectorIndexCount: 0,
    },
  };
}

describe("v2 WebGL render batches", () => {
  it("parses supported CSS color forms into normalized channels", () => {
    expect(parseRenderColor("#2859ff")).toEqual([40 / 255, 89 / 255, 1, 1]);
    expect(parseRenderColor("#fff8")).toEqual([1, 1, 1, 136 / 255]);
    expect(parseRenderColor("rgb(100% 0% 50% / 25%)")).toEqual([1, 0, 0.5, 0.25]);
    expect(parseRenderColor("rgba(10, 20, 30, 0.4)")).toEqual([
      10 / 255,
      20 / 255,
      30 / 255,
      0.4,
    ]);
    expect(parseRenderColor("color(display-p3 1 0 0)")).toBeNull();
  });

  it("packs rect, ellipse, and line commands into one z-ordered instance buffer", () => {
    const batch = buildWebGlPrimitiveBatch(
      renderList([
        item(
          "rect:shape",
          5,
          { kind: "rect", width: 80, height: 40, cornerRadius: 12, paint: PAINT },
          { ...IDENTITY, dx: 50, dy: 60 },
        ),
        item(
          "ellipse:shape",
          1,
          { kind: "ellipse", width: 30, height: 20, paint: PAINT },
          { ...IDENTITY, dx: 10, dy: 20 },
        ),
        item("line:shape", 3, {
          kind: "line",
          x1: 0,
          y1: 5,
          x2: 10,
          y2: 5,
          paint: { ...PAINT, fill: undefined, stroke: "#ff0000", strokeWidth: 2 },
        }),
      ]),
    );

    expect(batch.instanceCount).toBe(3);
    expect(batch.instances).toHaveLength(3 * WEBGL_INSTANCE_FLOATS);
    expect(batch.supportedCommandIds).toEqual(["rect:shape", "ellipse:shape", "line:shape"]);
    expect(batch.unsupportedCommandIds).toEqual([]);

    const ellipse = [...batch.instances.slice(0, WEBGL_INSTANCE_FLOATS)];
    expect(ellipse.slice(4, 8)).toEqual([10, 20, 30, 20]);
    expect(ellipse[18]).toBe(1);

    const line = [...batch.instances.slice(WEBGL_INSTANCE_FLOATS, WEBGL_INSTANCE_FLOATS * 2)];
    expect(line.slice(0, 8)).toEqual([1, 0, 0, 1, 0, 4, 10, 2]);
    expect(line[8]).toBe(1);
    expect(line[9]).toBe(0);
    expect(line[10]).toBe(0);
    expect(line[11]).toBeCloseTo(0.8);
    expect(line[17]).toBe(1);

    const rect = [...batch.instances.slice(WEBGL_INSTANCE_FLOATS * 2)];
    expect(rect.slice(4, 8)).toEqual([50, 60, 80, 40]);
    expect(rect[17]).toBe(12);
    expect(rect[18]).toBe(0);
  });

  it("reports unsupported, zero-area, and invalid-paint commands without corrupting the batch", () => {
    const batch = buildWebGlPrimitiveBatch(
      renderList([
        item("path:shape", 0, {
          kind: "path",
          points: [],
          closed: false,
          paint: PAINT,
        }),
        item("empty:shape", 1, {
          kind: "rect",
          width: 0,
          height: 20,
          cornerRadius: 0,
          paint: PAINT,
        }),
        item("invalid:shape", 2, {
          kind: "ellipse",
          width: 20,
          height: 20,
          paint: { ...PAINT, fill: "not-a-color" },
        }),
        item("image:placeholder", 3, {
          kind: "placeholder",
          resourceKind: "image",
          width: 50,
          height: 50,
        }),
      ]),
    );

    expect(batch.instanceCount).toBe(1);
    expect(batch.unsupportedCommandIds).toEqual(["path:shape", "image:placeholder"]);
    expect(batch.skippedCommandIds).toEqual(["empty:shape"]);
    expect(batch.invalidPaintCommandIds).toEqual(["invalid:shape"]);
  });

  it("preserves z-order while interleaving instanced shapes and Rust path meshes", () => {
    const path = item(
      "path:shape",
      2,
      {
        kind: "path",
        points: [],
        closed: true,
        paint: PAINT,
        geometry: {
          version: 1,
          tolerance: 0.25,
          fill: {
            vertices: [
              { x: 0, y: 0 },
              { x: 20, y: 0 },
              { x: 10, y: 20 },
            ],
            indices: [0, 1, 2],
            bounds: { x: 0, y: 0, width: 20, height: 20 },
          },
          stroke: {
            vertices: [
              { x: -1, y: -1 },
              { x: 21, y: -1 },
              { x: 10, y: 21 },
            ],
            indices: [0, 1, 2],
            bounds: { x: -1, y: -1, width: 22, height: 22 },
          },
          stats: {
            pathPointCount: 3,
            fillVertexCount: 3,
            fillIndexCount: 3,
            strokeVertexCount: 3,
            strokeIndexCount: 3,
          },
          fingerprint: "geometry-1",
        },
      },
      { ...IDENTITY, dx: 10, dy: 20 },
    );
    const plan = buildWebGlDrawPlan(
      renderList([
        item("ellipse:shape", 3, { kind: "ellipse", width: 20, height: 20, paint: PAINT }),
        path,
        item("rect:shape", 1, {
          kind: "rect",
          width: 20,
          height: 20,
          cornerRadius: 2,
          paint: PAINT,
        }),
      ]),
    );

    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      "instances",
      "mesh",
      "instances",
    ]);
    expect(plan.instanceCount).toBe(2);
    expect(plan.meshVertexCount).toBe(6);
    expect(plan.meshIndexCount).toBe(6);
    expect(plan.triangleCount).toBe(6);
    expect(plan.supportedCommandIds).toEqual(["rect:shape", "path:shape", "ellipse:shape"]);
    expect(plan.unsupportedCommandIds).toEqual([]);
    const meshOperation = plan.operations[1];
    expect(meshOperation.kind).toBe("mesh");
    if (meshOperation.kind !== "mesh") {
      throw new Error("Expected a mesh operation.");
    }
    const firstVertex = [...meshOperation.batch.vertices.slice(0, 6)];
    expect(firstVertex[0]).toBe(10);
    expect(firstVertex[1]).toBe(20);
    expect(firstVertex[2]).toBeCloseTo(40 / 255);
    expect(firstVertex[3]).toBeCloseTo(89 / 255);
    expect(firstVertex[4]).toBe(1);
    expect(firstVertex[5]).toBeCloseTo(0.8);
  });

  it("rejects malformed mesh indices without sending corrupt geometry to WebGL", () => {
    const plan = buildWebGlDrawPlan(
      renderList([
        item("broken:shape", 0, {
          kind: "path",
          points: [],
          closed: true,
          paint: PAINT,
          geometry: {
            version: 1,
            tolerance: 0.25,
            fill: {
              vertices: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 0, y: 10 },
              ],
              indices: [0, 1, 9],
              bounds: { x: 0, y: 0, width: 10, height: 10 },
            },
            stats: {
              pathPointCount: 3,
              fillVertexCount: 3,
              fillIndexCount: 3,
              strokeVertexCount: 0,
              strokeIndexCount: 0,
            },
            fingerprint: "broken",
          },
        }),
      ]),
    );

    expect(plan.operations).toEqual([]);
    expect(plan.supportedCommandIds).toEqual(["broken:shape"]);
    expect(plan.skippedCommandIds).toEqual(["broken:shape"]);
    expect(plan.invalidGeometryCommandIds).toEqual(["broken:shape"]);
  });
});
