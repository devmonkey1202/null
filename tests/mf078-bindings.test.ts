import { describe, expect, it } from "vitest";

import { DEFAULT_TEXT_STYLE, addNode, createDoc, createNode, hydrateDoc } from "../src/advanced/doc/scene";
import type { FigmaNode } from "../src/lib/figma";
import { figmaNodesToNullDoc } from "../src/lib/figmaToNull";
import { nullDocToFigmaPayload } from "../src/lib/nullToFigma";

function walkFigma(node: FigmaNode, out: FigmaNode[] = []) {
  out.push(node);
  (node.children ?? []).forEach((child) => walkFigma(child, out));
  return out;
}

describe("MF-078 bindings", () => {
  it("roundtrips effect, text, and gradient stop variable bindings", () => {
    const doc = createDoc();
    doc.variableModes = ["Light", "Dark"];
    doc.variableMode = "Dark";
    doc.variables = [
      { id: "color_fx", name: "Effect Color", type: "color", value: "#111827", modes: { Dark: "#e5e7eb" } },
      { id: "color_stop_a", name: "Stop A", type: "color", value: "#ef4444", modes: { Dark: "#22c55e" } },
      { id: "color_stop_b", name: "Stop B", type: "color", value: "#3b82f6", modes: { Dark: "#a855f7" } },
      { id: "color_range", name: "Range Fill", type: "color", value: "#f59e0b" },
      { id: "num_x", name: "Shadow X", type: "number", value: 6 },
      { id: "num_y", name: "Shadow Y", type: "number", value: 8 },
      { id: "num_blur", name: "Shadow Blur", type: "number", value: 20 },
      { id: "num_font", name: "Font Size", type: "number", value: 28 },
      { id: "num_spacing", name: "Paragraph", type: "number", value: 18 },
      { id: "font_family", name: "Heading Family", type: "string", value: "Inter, sans-serif" },
    ];

    const rect = createNode("rect", {
      name: "Binding Card",
      frame: { x: 40, y: 40, w: 240, h: 160, rotation: 0 },
    });
    rect.style.fills = [
      {
        type: "linear",
        from: "#ef4444",
        to: "#3b82f6",
        angle: 24,
        stops: [
          { offset: 0, color: "#ef4444", colorRef: "color_stop_a" },
          { offset: 1, color: "#3b82f6", colorRef: "color_stop_b" },
        ],
      },
    ];
    rect.style.effects = [
      {
        type: "shadow",
        x: 2,
        y: 4,
        blur: 12,
        color: "#111827",
        xRef: "num_x",
        yRef: "num_y",
        blurRef: "num_blur",
        colorRef: "color_fx",
      },
    ];
    addNode(doc, rect, doc.pages[0]!.rootId);

    const text = createNode("text", {
      name: "Binding Headline",
      frame: { x: 64, y: 72, w: 180, h: 64, rotation: 0 },
    });
    text.text = {
      value: "Binding Headline",
      style: { ...DEFAULT_TEXT_STYLE, fontSize: 20, fontWeight: 700 },
      styleBindings: {
        fontFamily: "font_family",
        fontSize: "num_font",
      },
      ranges: [
        {
          start: 0,
          end: 7,
          style: { paragraphSpacing: 12 },
          styleBindings: { paragraphSpacing: "num_spacing" },
          fill: "#f59e0b",
          fillRef: "color_range",
        },
      ],
      wrap: true,
      autoSize: false,
    };
    addNode(doc, text, doc.pages[0]!.rootId);

    const exported = nullDocToFigmaPayload(doc, { fileName: "MF078" });
    const allNodes = walkFigma(exported.file.document);
    const exportedRect = allNodes.find((node) => node.name === "Binding Card");
    const exportedText = allNodes.find((node) => node.name === "Binding Headline");

    expect(exportedRect?.effects?.[0]).toMatchObject({
      boundVariables: {
        color: expect.objectContaining({ id: expect.stringContaining("color_fx") }),
        radius: expect.objectContaining({ id: expect.stringContaining("num_blur") }),
        offsetX: expect.objectContaining({ id: expect.stringContaining("num_x") }),
        offsetY: expect.objectContaining({ id: expect.stringContaining("num_y") }),
      },
    });
    expect(exportedRect?.fills?.[0]).toMatchObject({
      gradientStops: [
        expect.objectContaining({
          boundVariables: { color: expect.objectContaining({ id: expect.stringContaining("color_stop_a") }) },
        }),
        expect.objectContaining({
          boundVariables: { color: expect.objectContaining({ id: expect.stringContaining("color_stop_b") }) },
        }),
      ],
    });
    expect(exportedText?.style?.boundVariables).toMatchObject({
      fontFamily: expect.objectContaining({ id: expect.stringContaining("font_family") }),
      fontSize: expect.objectContaining({ id: expect.stringContaining("num_font") }),
    });
    const override = exportedText?.styleOverrideTable ? Object.values(exportedText.styleOverrideTable)[0] : null;
    expect(override?.boundVariables).toMatchObject({
      paragraphSpacing: expect.objectContaining({ id: expect.stringContaining("num_spacing") }),
    });
    expect(override?.fills?.[0]).toMatchObject({
      boundVariables: { color: expect.objectContaining({ id: expect.stringContaining("color_range") }) },
    });

    const imported = hydrateDoc(
      figmaNodesToNullDoc("mf078", exported.file.document, {
        fileName: exported.file.name,
        figmaStyles: exported.file.styles,
        figmaVariableCollections: exported.localVariables.meta?.variableCollections,
        figmaVariables: exported.localVariables.meta?.variables,
      }),
    );
    const importedRect = Object.values(imported.nodes).find((node) => node.name === "Binding Card");
    const importedText = Object.values(imported.nodes).find((node) => node.name === "Binding Headline");
    const importedColorFx = imported.variables.find((variable) => variable.name === "Effect Color")?.id;
    const importedStopA = imported.variables.find((variable) => variable.name === "Stop A")?.id;
    const importedStopB = imported.variables.find((variable) => variable.name === "Stop B")?.id;
    const importedRangeFill = imported.variables.find((variable) => variable.name === "Range Fill")?.id;
    const importedNumX = imported.variables.find((variable) => variable.name === "Shadow X")?.id;
    const importedNumY = imported.variables.find((variable) => variable.name === "Shadow Y")?.id;
    const importedNumBlur = imported.variables.find((variable) => variable.name === "Shadow Blur")?.id;
    const importedFont = imported.variables.find((variable) => variable.name === "Font Size")?.id;
    const importedFamily = imported.variables.find((variable) => variable.name === "Heading Family")?.id;
    const importedParagraph = imported.variables.find((variable) => variable.name === "Paragraph")?.id;

    expect(importedRect?.style.effects[0]).toMatchObject({
      type: "shadow",
      colorRef: importedColorFx,
      blurRef: importedNumBlur,
      xRef: importedNumX,
      yRef: importedNumY,
    });
    expect(importedRect?.style.fills[0]).toMatchObject({
      type: "linear",
      stops: [
        expect.objectContaining({ colorRef: importedStopA }),
        expect.objectContaining({ colorRef: importedStopB }),
      ],
    });
    expect(importedText?.text?.styleBindings).toMatchObject({
      fontFamily: importedFamily,
      fontSize: importedFont,
    });
    expect(importedText?.text?.ranges?.[0]).toMatchObject({
      fillRef: importedRangeFill,
      styleBindings: { paragraphSpacing: importedParagraph },
    });
  });
});
