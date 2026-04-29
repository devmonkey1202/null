import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode, hydrateDoc, type BlendMode } from "../src/advanced/doc/scene";
import { figmaNodesToNullDoc } from "../src/lib/figmaToNull";
import { nullDocToFigmaPayload } from "../src/lib/nullToFigma";

const CASES: Array<{ nullMode: BlendMode; figmaMode: string }> = [
  { nullMode: "color-burn", figmaMode: "COLOR_BURN" },
  { nullMode: "color-dodge", figmaMode: "COLOR_DODGE" },
  { nullMode: "hard-light", figmaMode: "HARD_LIGHT" },
  { nullMode: "soft-light", figmaMode: "SOFT_LIGHT" },
  { nullMode: "difference", figmaMode: "DIFFERENCE" },
  { nullMode: "exclusion", figmaMode: "EXCLUSION" },
  { nullMode: "hue", figmaMode: "HUE" },
  { nullMode: "saturation", figmaMode: "SATURATION" },
  { nullMode: "color", figmaMode: "COLOR" },
  { nullMode: "luminosity", figmaMode: "LUMINOSITY" },
];

describe("blend mode roundtrip", () => {
  it("exports and imports extended figma blend modes", () => {
    const doc = createDoc();
    CASES.forEach((entry, index) => {
      const node = createNode("rect", {
        id: `blend_${index}`,
        name: `Blend ${entry.nullMode}`,
        frame: { x: index * 20, y: 0, w: 20, h: 20, rotation: 0 },
      });
      node.style.blendMode = entry.nullMode;
      addNode(doc, node, doc.pages[0]!.rootId);
    });

    const exported = nullDocToFigmaPayload(doc, { fileName: "blend-modes" });
    const pageChildren = exported.file.document.children?.[0]?.children ?? [];
    CASES.forEach((entry) => {
      const exportedNode = pageChildren.find((node) => node.name === `Blend ${entry.nullMode}`);
      expect(exportedNode?.blendMode).toBe(entry.figmaMode);
    });

    const imported = hydrateDoc(figmaNodesToNullDoc("blend-modes", exported.file.document, { fileName: exported.file.name }));
    CASES.forEach((entry) => {
      const importedNode = Object.values(imported.nodes).find((node) => node.name === `Blend ${entry.nullMode}`);
      expect(importedNode?.style.blendMode).toBe(entry.nullMode);
    });
  });
});
