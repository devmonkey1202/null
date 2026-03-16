import { describe, expect, it } from "vitest";

import { hydrateDoc } from "../src/advanced/doc/scene";
import type { FigmaLocalVariable, FigmaLocalVariableCollection, FigmaNode } from "../src/lib/figma";
import { figmaNodesToNullDoc } from "../src/lib/figmaToNull";
import { collectDocParitySnapshot, roundtripDocThroughSerialize } from "./doc-parity";

describe("figma import roundtrip", () => {
  it("preserves editable vector and boolean semantics through NULL serialize roundtrip", () => {
    const docRoot: FigmaNode = {
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
            {
              id: "3:0",
              name: "Union",
              type: "BOOLEAN_OPERATION",
              booleanOperation: "UNION",
              absoluteBoundingBox: { x: 120, y: 0, width: 120, height: 120 },
              fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 } }],
              fillGeometry: [{ path: "M0 0L120 0L120 120Z" }],
              children: [
                {
                  id: "3:1",
                  name: "Operand A",
                  type: "RECTANGLE",
                  absoluteBoundingBox: { x: 120, y: 0, width: 80, height: 80 },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const imported = hydrateDoc(figmaNodesToNullDoc("fileKey", docRoot));
    const roundtripped = roundtripDocThroughSerialize(imported);

    expect(collectDocParitySnapshot(roundtripped)).toEqual(collectDocParitySnapshot(imported));
  });

  it("preserves imported components, styles, variables, and refs through NULL serialize roundtrip", () => {
    const collections: Record<string, FigmaLocalVariableCollection> = {
      "VariableCollectionId:theme": {
        id: "VariableCollectionId:theme",
        name: "Theme",
        defaultModeId: "mode_light",
        modes: [
          { modeId: "mode_light", name: "Light" },
          { modeId: "mode_dark", name: "Dark" },
        ],
      },
    };
    const variables: Record<string, FigmaLocalVariable> = {
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
    };
    const docRoot: FigmaNode = {
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
                      styles: { TEXT: "S:text_body" },
                      children: [],
                    },
                  ],
                },
              ],
            },
            {
              id: "3:0",
              name: "Rect",
              type: "RECTANGLE",
              absoluteBoundingBox: { x: 320, y: 0, width: 160, height: 80 },
              fills: [
                {
                  type: "SOLID",
                  color: { r: 1, g: 1, b: 1, a: 1 },
                  boundVariables: {
                    color: { type: "VARIABLE_ALIAS", id: "VariableID:brand" },
                  },
                },
              ],
              styles: { FILL: "S:fill_primary" },
              children: [],
            },
          ],
        },
      ],
    };

    const imported = hydrateDoc(
      figmaNodesToNullDoc("fileKey", docRoot, {
        figmaStyles: {
          "S:fill_primary": { name: "Paint/Primary", style_type: "FILL" },
          "S:text_body": { name: "Text/Body", style_type: "TEXT" },
        },
        figmaVariableCollections: collections,
        figmaVariables: variables,
      }),
    );
    const roundtripped = roundtripDocThroughSerialize(imported);

    expect(collectDocParitySnapshot(roundtripped)).toEqual(collectDocParitySnapshot(imported));
  });

  it("preserves imported grid layouts, guide alignment, and grid child placement through NULL serialize roundtrip", () => {
    const docRoot: FigmaNode = {
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
    };

    const imported = hydrateDoc(figmaNodesToNullDoc("fileKey", docRoot));
    const roundtripped = roundtripDocThroughSerialize(imported);

    expect(collectDocParitySnapshot(roundtripped)).toEqual(collectDocParitySnapshot(imported));
  });
});
