import { describe, expect, it } from "vitest";

import { DEFAULT_TEXT_STYLE, createDoc, createNode } from "../src/advanced/doc/scene";
import {
  applyTextStyleVariableBindings,
  resolveGradientStopColor,
  resolveNodeTextStyle,
  resolveNodeTextValue,
  resolveVariableValue,
} from "../src/advanced/geom/variableBindings";

describe("variable bindings", () => {
  it("resolves variable aliases through active modes", () => {
    const doc = createDoc();
    doc.variableModes = ["Light", "Dark"];
    doc.variableMode = "Dark";
    doc.variables = [
      { id: "color_brand", name: "Brand", type: "color", value: "#2563eb", modes: { Dark: "#93c5fd" } },
      {
        id: "color_accent",
        name: "Accent",
        type: "color",
        value: "#2563eb",
        aliasOf: "color_brand",
        modeAliases: { Light: "color_brand", Dark: "color_brand" },
      },
    ];

    expect(resolveVariableValue(doc, "color_accent")).toBe("#93c5fd");
  });

  it("applies text content and style bindings", () => {
    const doc = createDoc();
    doc.variables = [
      { id: "label_text", name: "Label", type: "string", value: "Deploy" },
      { id: "font_size", name: "Font Size", type: "number", value: 22 },
      { id: "line_height", name: "Line Height", type: "number", value: 1.8 },
    ];

    const node = createNode("text");
    node.text = {
      ...(node.text ?? { value: "", style: { ...DEFAULT_TEXT_STYLE } }),
      value: "Fallback",
      valueRef: "label_text",
      styleBindings: {
        fontSize: "font_size",
        lineHeight: "line_height",
      },
    };

    expect(resolveNodeTextValue(doc, node.text)).toBe("Deploy");
    expect(resolveNodeTextStyle(doc, node.text, node.text.style)).toMatchObject({
      fontSize: 22,
      lineHeight: 1.8,
    });
    expect(
      applyTextStyleVariableBindings(doc, node.text.style, {
        fontSize: "font_size",
      }),
    ).toMatchObject({ fontSize: 22 });
  });

  it("resolves gradient stop colors from color refs", () => {
    const doc = createDoc();
    doc.variables = [{ id: "color_start", name: "Start", type: "color", value: "#22c55e" }];

    expect(resolveGradientStopColor(doc, { offset: 0, color: "#000000", colorRef: "color_start" })).toBe("#22c55e");
  });
});
