import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("figmaFileToNullDoc", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("unexpected network request");
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps simple vector nodes editable instead of forcing image fallback", async () => {
    const getFile = vi.fn(async () => ({
      name: "Vector File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Vector",
                type: "VECTOR",
                absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
                fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
                fillGeometry: [{ path: "M0 0L10 0L10 10Z" }, { path: "M20 20L30 20L30 30Z" }],
                children: [],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });
    const vectorNode = Object.values(doc.nodes).find((node) => node.name === "Vector");

    expect(getImages).not.toHaveBeenCalled();
    expect(vectorNode?.type).toBe("path");
    expect(vectorNode?.shape?.segments).toEqual([
      { d: "M0 0L10 0L10 10Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
      { d: "M20 20L30 20L30 30Z", fills: [{ type: "solid", color: "#ff0000", opacity: 1 }] },
    ]);
    expect(vectorNode?.shape?.vectorNetwork?.paths).toHaveLength(2);
    expect(vectorNode?.shape?.vectorNetwork?.paths[0]).toMatchObject({
      id: "segment_0",
      closed: true,
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
    expect(vectorNode?.shape?.vectorNetwork?.paths[1]).toMatchObject({
      id: "segment_1",
      closed: true,
      fills: [{ type: "solid", color: "#ff0000", opacity: 1 }],
    });
  });

  it("keeps simple mask chains editable instead of requesting image renders", async () => {
    const getFile = vi.fn(async () => ({
      name: "Mask File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Masked Frame",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 200 },
                children: [
                  {
                    id: "3:0",
                    name: "Content",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 20, y: 20, width: 160, height: 160 },
                    fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
                    children: [],
                  },
                  {
                    id: "4:0",
                    name: "Mask",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 120 },
                    fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
                    isMask: true,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getImages).not.toHaveBeenCalled();
    expect(doc.nodes["figma_4_0"]?.isMask).toBe(true);
    expect(doc.nodes["figma_page_1"]?.children).toEqual(["figma_2_0"]);
    expect(doc.nodes["figma_2_0"]?.children).toEqual(["figma_4_0", "figma_3_0"]);
  });

  it("keeps simple boolean operations editable instead of requesting image renders", async () => {
    const getFile = vi.fn(async () => ({
      name: "Boolean File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Union",
                type: "BOOLEAN_OPERATION",
                booleanOperation: "UNION",
                absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 120 },
                fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 } }],
                fillGeometry: [{ path: "M0 0L120 0L120 120Z" }],
                children: [
                  {
                    id: "3:0",
                    name: "Operand A",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 80 },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getImages).not.toHaveBeenCalled();
    expect(doc.nodes["figma_2_0"]?.type).toBe("path");
    expect(doc.nodes["figma_2_0"]?.shape?.booleanMeta?.op).toBe("union");
    expect(doc.nodes["figma_2_0"]?.shape?.booleanMeta?.source).toBe("figma-import");
    expect(doc.nodes["figma_2_0"]?.shape?.booleanMeta?.operands?.[0]).toMatchObject({
      sourceId: "3:0",
      name: "Operand A",
      type: "rect",
      pathData: "M 0 0 L 80 0 L 80 80 L 0 80 Z",
      frame: { x: 0, y: 0, w: 80, h: 80, rotation: 0 },
    });
    expect(doc.nodes["figma_2_0"]?.shape?.booleanMeta?.operands?.[0]?.vectorNetwork?.paths).toHaveLength(1);
    expect(doc.nodes["figma_2_0"]?.shape?.vectorNetwork).toBeDefined();
    expect(doc.nodes["figma_2_0"]?.shape?.vectorNetwork?.paths).toEqual([
      {
        id: "path_0",
        vertexIds: ["path_0_v0", "path_0_v1", "path_0_v2"],
        closed: true,
        fills: undefined,
      },
    ]);
    expect(doc.nodes["figma_3_0"]).toBeUndefined();
  });

  it("requests image renders only for fidelity fallbacks such as complex gradients", async () => {
    const getFile = vi.fn(async () => ({
      name: "Gradient Vector File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Gradient Vector",
                type: "VECTOR",
                absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
                fills: [{ type: "GRADIENT_RADIAL", gradientStops: [], gradientHandlePositions: [] }],
                fillGeometry: [{ path: "M0 0L10 0L10 10Z" }],
                children: [],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: { "2:0": "https://example.com/gradient-vector.png" } }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getImages).toHaveBeenCalled();
    expect(doc.nodes["figma_2_0"]?.type).toBe("image");
    expect(doc.nodes["figma_2_0"]?.image?.src).toBe("https://example.com/gradient-vector.png");
  });

  it("imports component sets and instances into the NULL component/variant model", async () => {
    const getFile = vi.fn(async () => ({
      name: "Component File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Button",
                type: "COMPONENT_SET",
                absoluteBoundingBox: { x: 0, y: 0, width: 280, height: 120 },
                componentPropertyDefinitions: {
                  "Label#2:0": { type: "TEXT", defaultValue: "Button" },
                },
                children: [
                  {
                    id: "2:1",
                    name: "Primary",
                    type: "COMPONENT",
                    absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 44 },
                    variantProperties: { State: "Primary", Size: "M" },
                    children: [
                      {
                        id: "2:1:1",
                        name: "Label",
                        type: "TEXT",
                        absoluteBoundingBox: { x: 16, y: 10, width: 48, height: 24 },
                        characters: "Button",
                        style: { fontSize: 16, fontWeight: 600 },
                        componentPropertyReferences: { characters: "Label#2:0" },
                        children: [],
                      },
                    ],
                  },
                  {
                    id: "2:2",
                    name: "Secondary",
                    type: "COMPONENT",
                    absoluteBoundingBox: { x: 140, y: 0, width: 120, height: 44 },
                    variantProperties: { State: "Secondary", Size: "M" },
                    children: [
                      {
                        id: "2:2:1",
                        name: "Label",
                        type: "TEXT",
                        absoluteBoundingBox: { x: 156, y: 10, width: 52, height: 24 },
                        characters: "Ghost",
                        style: { fontSize: 16, fontWeight: 600 },
                        componentPropertyReferences: { characters: "Label#2:0" },
                        children: [],
                      },
                    ],
                  },
                ],
              },
              {
                id: "3:0",
                name: "Button Instance",
                type: "INSTANCE",
                componentId: "2:2",
                componentProperties: {
                  "Label#2:0": { type: "TEXT", value: "Ghost CTA" },
                },
                absoluteBoundingBox: { x: 360, y: 0, width: 120, height: 44 },
                children: [
                  {
                    id: "3:1",
                    name: "Label",
                    type: "TEXT",
                    absoluteBoundingBox: { x: 376, y: 10, width: 52, height: 24 },
                    characters: "Ghost CTA",
                    style: { fontSize: 16, fontWeight: 600 },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(doc.nodes["figma_2_0"]?.type).toBe("component");
    expect(doc.nodes["figma_2_0"]?.propertyDefinitions).toEqual({
      figma_2_1_1: { kind: "text", name: "Label" },
      figma_2_2_1: { kind: "text", name: "Label" },
    });
    expect(doc.nodes["figma_2_0"]?.variants).toEqual([
      { id: "figma_2_1__variant", name: "Size=M, State=Primary", rootId: "figma_2_1", props: { State: "Primary", Size: "M" } },
      { id: "figma_2_2__variant", name: "Size=M, State=Secondary", rootId: "figma_2_2", props: { State: "Secondary", Size: "M" } },
    ]);
    expect(doc.nodes["figma_3_0"]?.instanceOf).toBe("figma_2_0");
    expect(doc.nodes["figma_3_0"]?.variantId).toBe("figma_2_2__variant");
    expect(doc.nodes["figma_3_0"]?.sourceId).toBe("figma_2_0");
    expect(doc.nodes["figma_3_1"]?.text?.value).toBe("Ghost CTA");
    expect(doc.nodes["figma_3_1"]?.overrides?.text?.value).toBe("Ghost CTA");
    expect(doc.nodes["figma_3_1"]?.sourceId).toBe("figma_2_2_1");
  });

  it("preserves auto-layout justify, wrap spacing, and sizing through figmaFileToNullDoc", async () => {
    const getFile = vi.fn(async () => ({
      name: "Auto Layout File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Wrapped Stack",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
                layoutMode: "HORIZONTAL",
                layoutWrap: "WRAP",
                itemSpacing: 12,
                counterAxisSpacing: 24,
                primaryAxisAlignItems: "CENTER",
                counterAxisAlignItems: "STRETCH",
                counterAxisAlignContent: "SPACE_BETWEEN",
                strokesIncludedInLayout: true,
                layoutSizingHorizontal: "HUG",
                layoutSizingVertical: "FILL",
                minWidth: 280,
                maxWidth: 640,
                minHeight: 100,
                maxHeight: 320,
                children: [
                  {
                    id: "3:0",
                    name: "Card",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 24, y: 24, width: 120, height: 48 },
                    layoutSizingHorizontal: "FILL",
                    layoutSizingVertical: "FIXED",
                    minWidth: 120,
                    maxWidth: 260,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });
    const frameNode = doc.nodes["figma_2_0"];
    const childNode = doc.nodes["figma_3_0"];

    expect(getImages).not.toHaveBeenCalled();
    expect(frameNode?.layout).toMatchObject({
      dir: "row",
      justify: "center",
      wrap: true,
      wrapGap: 24,
      wrapAlign: "space-between",
      includeStrokeInBounds: true,
    });
    expect(frameNode?.layoutSizing).toEqual({
      width: "hug",
      height: "fill",
      minWidth: 280,
      minHeight: 100,
      maxWidth: 640,
      maxHeight: 320,
    });
    expect(childNode?.layoutSizing).toEqual({
      width: "fill",
      height: "fixed",
      minWidth: 120,
      minHeight: undefined,
      maxWidth: 260,
      maxHeight: undefined,
    });
  });

  it("preserves Ignore Auto Layout children through figmaFileToNullDoc", async () => {
    const getFile = vi.fn(async () => ({
      name: "Ignore Auto Layout File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Auto Frame",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
                layoutMode: "HORIZONTAL",
                children: [
                  {
                    id: "3:0",
                    name: "Floating Card",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 180, y: 24, width: 90, height: 60 },
                    layoutPositioning: "ABSOLUTE",
                    layoutGrow: 1,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getImages).not.toHaveBeenCalled();
    expect(doc.nodes["figma_3_0"]?.layoutPositioning).toBe("absolute");
    expect(doc.nodes["figma_3_0"]?.layoutSizing).toMatchObject({ width: "fixed", height: "fixed" });
    expect(doc.nodes["figma_3_0"]?.frame).toMatchObject({ x: 180, y: 24, w: 90, h: 60 });
  });

  it("preserves grid layouts, guide alignment, and grid child placement through figmaFileToNullDoc", async () => {
    const getFile = vi.fn(async () => ({
      name: "Grid File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Grid Frame",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 640, height: 360 },
                layoutMode: "GRID",
                gridColumnCount: 3,
                gridRowCount: 2,
                gridColumnGap: 24,
                gridRowGap: 18,
                gridColumnsSizing: "120px 1fr 2fr",
                gridRowsSizing: "auto 80px",
                paddingTop: 12,
                paddingRight: 16,
                paddingBottom: 20,
                paddingLeft: 24,
                layoutGrids: [
                  {
                    pattern: "COLUMNS",
                    visible: true,
                    count: 3,
                    gutterSize: 24,
                    offset: 24,
                    alignment: "STRETCH",
                    color: { r: 0.31, g: 0.27, b: 0.9, a: 0.1 },
                  },
                  {
                    pattern: "ROWS",
                    visible: true,
                    count: 4,
                    sectionSize: 56,
                    gutterSize: 16,
                    offset: 20,
                    alignment: "CENTER",
                    color: { r: 0.13, g: 0.77, b: 0.37, a: 0.08 },
                  },
                ],
                children: [
                  {
                    id: "3:0",
                    name: "Grid Item",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 160, y: 32, width: 120, height: 48 },
                    gridColumnAnchorIndex: 2,
                    gridRowAnchorIndex: 1,
                    gridColumnSpan: 2,
                    gridRowSpan: 1,
                    gridChildHorizontalAlign: "CENTER",
                    gridChildVerticalAlign: "MAX",
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getImages).not.toHaveBeenCalled();
    expect(doc.nodes["figma_2_0"]?.layout).toEqual({
      mode: "grid",
      columns: 3,
      rows: 2,
      columnGap: 24,
      rowGap: 18,
      padding: { t: 12, r: 16, b: 20, l: 24 },
      columnsSizing: [
        { type: "fixed", value: 120 },
        { type: "flex", value: 1 },
        { type: "flex", value: 2 },
      ],
      rowsSizing: [{ type: "hug" }, { type: "fixed", value: 80 }],
    });
    expect(doc.nodes["figma_2_0"]?.layoutGrid).toEqual([
      expect.objectContaining({ type: "columns", alignment: "stretch", gutter: 24, offset: 24 }),
      expect.objectContaining({ type: "rows", alignment: "center", height: 56, gutter: 16, offset: 20 }),
    ]);
    expect(doc.nodes["figma_3_0"]?.gridChild).toEqual({
      row: 0,
      column: 1,
      rowSpan: 1,
      columnSpan: 2,
      horizontalAlign: "center",
      verticalAlign: "end",
    });
  });

  it("derives child fill sizing from parent auto-layout direction through figmaFileToNullDoc", async () => {
    const getFile = vi.fn(async () => ({
      name: "Child Sizing File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Row Auto",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 240, height: 80 },
                layoutMode: "HORIZONTAL",
                children: [
                  {
                    id: "3:0",
                    name: "Row Fill",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 12, y: 12, width: 80, height: 32 },
                    layoutGrow: 1,
                    children: [],
                  },
                ],
              },
              {
                id: "4:0",
                name: "Column Auto",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 100, width: 240, height: 180 },
                layoutMode: "VERTICAL",
                children: [
                  {
                    id: "5:0",
                    name: "Column Fill",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 12, y: 112, width: 80, height: 32 },
                    layoutGrow: 1,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getImages).not.toHaveBeenCalled();
    expect(doc.nodes["figma_3_0"]?.layoutSizing).toMatchObject({ width: "fill", height: "fixed" });
    expect(doc.nodes["figma_5_0"]?.layoutSizing).toMatchObject({ width: "fixed", height: "fill" });
  });

  it("preserves text auto-resize and line-height ratios through figmaFileToNullDoc", async () => {
    const getFile = vi.fn(async () => ({
      name: "Text File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Frame",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 240 },
                children: [
                  {
                    id: "3:0",
                    name: "Auto Width",
                    type: "TEXT",
                    absoluteBoundingBox: { x: 20, y: 20, width: 140, height: 32 },
                    characters: "Auto Width",
                    style: {
                      fontSize: 16,
                      fontWeight: 600,
                      lineHeightPercentFontSize: 150,
                      textAutoResize: "WIDTH_AND_HEIGHT",
                      fontFeatureSettings: "\"liga\" 1, \"ss01\" 1",
                      fontVariationSettings: "\"wght\" 650, \"wdth\" 95",
                    },
                    children: [],
                  },
                  {
                    id: "4:0",
                    name: "Fixed Box",
                    type: "TEXT",
                    absoluteBoundingBox: { x: 20, y: 64, width: 160, height: 80 },
                    characters: "Wrapped paragraph",
                    style: {
                      fontSize: 20,
                      lineHeightPercent: 120,
                      textAutoResize: "HEIGHT",
                      textDecoration: "STRIKETHROUGH",
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getImages).not.toHaveBeenCalled();
    expect(doc.nodes["figma_3_0"]?.text).toMatchObject({
      wrap: false,
      autoSize: true,
      style: {
        lineHeight: 1.5,
        fontFeatureSettings: "\"liga\" 1, \"ss01\" 1",
        fontVariationSettings: "\"wght\" 650, \"wdth\" 95",
      },
    });
    expect(doc.nodes["figma_3_0"]?.layoutSizing).toMatchObject({
      width: "hug",
      height: "hug",
    });
    expect(doc.nodes["figma_4_0"]?.text).toMatchObject({
      wrap: true,
      autoSize: false,
      style: {
        lineHeight: 1.2,
        lineThrough: true,
      },
    });
    expect(doc.nodes["figma_4_0"]?.layoutSizing).toMatchObject({
      width: "fixed",
      height: "hug",
    });
  });

  it("preserves justified text alignment through figmaFileToNullDoc", async () => {
    const getFile = vi.fn(async () => ({
      name: "Justified Text File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Frame",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
                children: [
                  {
                    id: "3:0",
                    name: "Justified Copy",
                    type: "TEXT",
                    absoluteBoundingBox: { x: 20, y: 20, width: 200, height: 80 },
                    characters: "Long paragraph text",
                    style: {
                      fontSize: 16,
                      fontWeight: 400,
                      textAlignHorizontal: "JUSTIFIED",
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getImages).not.toHaveBeenCalled();
    expect(doc.nodes["figma_3_0"]?.text?.style.align).toBe("justify");
  });

  it("imports shared style metadata through figmaFileToNullDoc", async () => {
    const getFile = vi.fn(async () => ({
      name: "Styles File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      styles: {
        "S:fill_primary": { name: "Paint/Primary", style_type: "FILL" },
        "S:text_body": { name: "Text/Body", style_type: "TEXT" },
        "S:effect_soft": { name: "Effect/Soft Shadow", style_type: "EFFECT" },
      },
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Frame",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 180 },
                children: [
                  {
                    id: "3:0",
                    name: "Rect",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 20, y: 20, width: 120, height: 60 },
                    fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
                    effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 12, visible: true }],
                    styles: { FILL: "S:fill_primary", EFFECT: "S:effect_soft" },
                    children: [],
                  },
                  {
                    id: "4:0",
                    name: "Text",
                    type: "TEXT",
                    absoluteBoundingBox: { x: 20, y: 100, width: 140, height: 40 },
                    characters: "Styled text",
                    style: { fontSize: 16, fontWeight: 500 },
                    styles: { TEXT: "S:text_body" },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(doc.nodes["figma_3_0"]?.style.fillStyleId).toBe("figma_style_fill_S_fill_primary");
    expect(doc.nodes["figma_3_0"]?.style.effectStyleId).toBe("figma_style_effect_S_effect_soft");
    expect(doc.nodes["figma_4_0"]?.text?.styleRef).toBe("figma_style_text_S_text_body");
    expect(doc.styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "figma_style_fill_S_fill_primary", name: "Paint/Primary", type: "fill" }),
        expect.objectContaining({ id: "figma_style_effect_S_effect_soft", name: "Effect/Soft Shadow", type: "effect" }),
        expect.objectContaining({ id: "figma_style_text_S_text_body", name: "Text/Body", type: "text" }),
      ]),
    );
  });

  it("imports local variables, modes, and color fill/stroke bindings through figmaFileToNullDoc", async () => {
    const getFile = vi.fn(async () => ({
      name: "Variables File",
      lastModified: "2026-03-12T00:00:00.000Z",
      version: "1",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:0",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:0",
                name: "Rect",
                type: "RECTANGLE",
                absoluteBoundingBox: { x: 0, y: 0, width: 160, height: 80 },
                fills: [
                  {
                    type: "SOLID",
                    color: { r: 1, g: 1, b: 1, a: 1 },
                    boundVariables: {
                      color: { type: "VARIABLE_ALIAS", id: "VariableID:brand" },
                    },
                  },
                ],
                strokes: [
                  {
                    type: "SOLID",
                    color: { r: 0, g: 0, b: 0, a: 1 },
                    boundVariables: {
                      color: { type: "VARIABLE_ALIAS", id: "VariableID:border" },
                    },
                  },
                ],
                strokeWeight: 2,
                children: [],
              },
            ],
          },
        ],
      },
    }));
    const getLocalVariables = vi.fn(async () => ({
      meta: {
        variableCollections: {
          "VariableCollectionId:theme": {
            id: "VariableCollectionId:theme",
            name: "Theme",
            defaultModeId: "mode_light",
            modes: [
              { modeId: "mode_light", name: "Light" },
              { modeId: "mode_dark", name: "Dark" },
            ],
          },
        },
        variables: {
          "VariableID:brand": {
            id: "VariableID:brand",
            name: "Brand",
            variableCollectionId: "VariableCollectionId:theme",
            resolvedType: "COLOR",
            valuesByMode: {
              mode_light: { r: 1, g: 0, b: 0, a: 1 },
              mode_dark: { r: 0, g: 0, b: 1, a: 1 },
            },
          },
          "VariableID:border": {
            id: "VariableID:border",
            name: "Border",
            variableCollectionId: "VariableCollectionId:theme",
            resolvedType: "COLOR",
            valuesByMode: {
              mode_light: { r: 0, g: 0, b: 0, a: 1 },
              mode_dark: { r: 1, g: 1, b: 1, a: 1 },
            },
          },
        },
      },
    }));
    const getImages = vi.fn(async () => ({ images: {} }));
    const actualFigma = await vi.importActual<typeof import("../src/lib/figma")>("../src/lib/figma");

    vi.doMock("../src/lib/figma", () => ({
      ...actualFigma,
      getFile,
      getFileNodes: vi.fn(),
      getImages,
      getLocalVariables,
    }));

    const { figmaFileToNullDoc } = await import("../src/lib/figmaToNull");
    const doc = await figmaFileToNullDoc({ fileKey: "fileKey", accessToken: "token" });

    expect(getLocalVariables).toHaveBeenCalledWith("fileKey", "token");
    expect(doc.variableModes).toEqual(["Light", "Dark"]);
    expect(doc.variableMode).toBe("Light");
    expect(doc.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "figma_var_VariableID_brand",
          name: "Brand",
          type: "color",
          value: "#ff0000",
          modes: { Light: "#ff0000", Dark: "#0000ff" },
        }),
        expect.objectContaining({
          id: "figma_var_VariableID_border",
          name: "Border",
          type: "color",
          value: "#000000",
          modes: { Light: "#000000", Dark: "#ffffff" },
        }),
      ]),
    );
    expect(doc.nodes["figma_2_0"]?.style.fillRef).toBe("figma_var_VariableID_brand");
    expect(doc.nodes["figma_2_0"]?.style.strokeRef).toBe("figma_var_VariableID_border");
  });
});
