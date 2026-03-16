import { describe, expect, it } from "vitest";

import {
  applyEditableVectorPathModels,
  buildEditableVectorPathModels,
  createEditableVectorPathModel,
  replaceEditableVectorPathModelPath,
  vectorNetworkFromEditableVectorPathModels,
} from "../src/advanced/geom/vectorEditModel";
import { pathDataFromVectorPathId } from "../src/advanced/geom/vectorNetwork";

describe("vector edit model", () => {
  it("builds anchor and edge models from a vectorNetwork-only shape while preserving ids and fills", () => {
    const models = buildEditableVectorPathModels({
      vectorNetwork: {
        vertices: [
          { id: "a0", x: 0, y: 0, handleOutX: 10, handleOutY: 0, isSmooth: true },
          { id: "a1", x: 20, y: 10, handleInX: 10, handleInY: 10 },
        ],
        segments: [
          { id: "as0", from: "a0", to: "a1" },
          { id: "as1", from: "a1", to: "a0" },
        ],
        paths: [
          {
            id: "path_a",
            vertexIds: ["a0", "a1"],
            closed: true,
            fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
          },
        ],
      },
    });

    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      pathId: "path_a",
      closed: true,
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
    expect(models[0]?.anchors).toEqual([
      {
        vertexId: "a0",
        x: 0,
        y: 0,
        isSmooth: true,
        handleOut: { x: 10, y: 0 },
      },
      {
        vertexId: "a1",
        x: 20,
        y: 10,
        handleIn: { x: 10, y: 10 },
      },
    ]);
    expect(models[0]?.edges).toEqual([
      { segmentId: "as0", fromVertexId: "a0", toVertexId: "a1", kind: "cubic" },
      { segmentId: "as1", fromVertexId: "a1", toVertexId: "a0", kind: "line" },
    ]);
  });

  it("replaces only the targeted editable path when rebuilding a multi-path vector network", () => {
    const initial = [
      createEditableVectorPathModel("path_a", "M 0 0 L 10 0 L 10 10 Z", [{ type: "solid", color: "#ff0000", opacity: 1 }]),
      createEditableVectorPathModel("path_b", "M 20 20 L 30 20 L 30 30 Z", [{ type: "solid", color: "#00ff00", opacity: 1 }]),
    ];
    const replaced = replaceEditableVectorPathModelPath(initial, "path_b", "M 21 21 L 31 21 L 31 31 Z");
    const network = vectorNetworkFromEditableVectorPathModels(replaced);

    expect(network).toBeDefined();
    expect(pathDataFromVectorPathId(network, "path_a")).toBe("M 0 0 L 10 0 L 10 10 L 0 0 Z");
    expect(pathDataFromVectorPathId(network, "path_b")).toBe("M 21 21 L 31 21 L 31 31 L 21 21 Z");
    expect(network?.paths).toEqual([
      {
        id: "path_a",
        vertexIds: ["path_a_vertex_0", "path_a_vertex_1", "path_a_vertex_2"],
        closed: true,
        fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
      },
      {
        id: "path_b",
        vertexIds: ["path_b_vertex_0", "path_b_vertex_1", "path_b_vertex_2"],
        closed: true,
        fills: [{ type: "solid", color: "#00ff00", opacity: 1 }],
      },
    ]);
  });

  it("applies editable path models back into a vector-only shape without falling back to pathData or segments", () => {
    const paths = [
      createEditableVectorPathModel("path_a", "M 5 5 L 15 5 L 15 15 Z", [{ type: "solid", color: "#ff0000", opacity: 1 }]),
    ];

    const nextShape = applyEditableVectorPathModels(
      {
        pathData: "M 0 0 L 10 0 L 10 10 Z",
        segments: [{ d: "M 0 0 L 10 0 L 10 10 Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] }],
      },
      paths,
      { preferVectorOnly: true },
    );

    expect(nextShape.pathData).toBeUndefined();
    expect(nextShape.segments).toBeUndefined();
    expect(nextShape.vectorNetwork?.paths).toHaveLength(1);
    expect(pathDataFromVectorPathId(nextShape.vectorNetwork, "path_a")).toBe("M 5 5 L 15 5 L 15 15 L 5 5 Z");
  });
});
