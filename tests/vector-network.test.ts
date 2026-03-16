import { describe, expect, it } from "vitest";

import { pathDataFromVectorNetwork, primaryPathDataFromShape, vectorNetworkFromPathData, vectorNetworkFromShape, withDerivedVectorNetwork } from "../src/advanced/geom/vectorNetwork";

describe("vector network", () => {
  it("derives a closed network from simple pathData", () => {
    const network = vectorNetworkFromPathData("M 0 0 L 10 0 L 10 10 Z");

    expect(network).toBeDefined();
    expect(network?.vertices).toHaveLength(3);
    expect(network?.segments).toHaveLength(3);
    expect(network?.paths).toEqual([
      {
        id: "path_0",
        vertexIds: ["path_0_v0", "path_0_v1", "path_0_v2"],
        closed: true,
        fills: undefined,
      },
    ]);
  });

  it("derives one vector path per segment when shape.segments exist", () => {
    const network = vectorNetworkFromShape({
      segments: [
        { d: "M 0 0 L 10 0 L 10 10 Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
        { d: "M 20 20 L 30 20 L 30 30 Z", fills: [{ type: "solid", color: "#00ff00", opacity: 1 }] },
      ],
    });

    expect(network?.paths).toHaveLength(2);
    expect(network?.paths[0]).toMatchObject({
      id: "segment_0",
      closed: true,
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
    expect(network?.paths[1]).toMatchObject({
      id: "segment_1",
      closed: true,
      fills: [{ type: "solid", color: "#00ff00", opacity: 1 }],
    });
  });

  it("preserves the source shape while syncing a derived vector network", () => {
    const shape = withDerivedVectorNetwork({
      pathData: "M 0 0 C 10 0 10 10 20 10 Z",
      booleanMeta: {
        op: "union",
        source: "editor",
      },
    });

    expect(shape.pathData).toBe("M 0 0 C 10 0 10 10 20 10 Z");
    expect(shape.booleanMeta).toEqual({
      op: "union",
      source: "editor",
    });
    expect(shape.vectorNetwork?.vertices).toHaveLength(2);
    expect(shape.vectorNetwork?.segments).toHaveLength(2);
    expect(shape.vectorNetwork?.vertices[0]).toMatchObject({
      id: "path_0_v0",
      x: 0,
      y: 0,
      handleOutX: 10,
      handleOutY: 0,
    });
    expect(shape.vectorNetwork?.vertices[1]).toMatchObject({
      id: "path_0_v1",
      x: 20,
      y: 10,
      handleInX: 10,
      handleInY: 10,
    });
  });

  it("rebuilds pathData from a vectorNetwork-only shape", () => {
    const shape = {
      vectorNetwork: {
        vertices: [
          { id: "v0", x: 0, y: 0, handleOutX: 10, handleOutY: 0 },
          { id: "v1", x: 20, y: 10, handleInX: 10, handleInY: 10 },
        ],
        segments: [
          { id: "s0", from: "v0", to: "v1" },
          { id: "s1", from: "v1", to: "v0" },
        ],
        paths: [{ id: "p0", vertexIds: ["v0", "v1"], closed: true }],
      },
    };

    expect(pathDataFromVectorNetwork(shape.vectorNetwork)).toBe("M 0 0 C 10 0 10 10 20 10 L 0 0 Z");
    expect(primaryPathDataFromShape(shape)).toBe("M 0 0 C 10 0 10 10 20 10 L 0 0 Z");
  });
});
