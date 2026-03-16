import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode } from "../src/advanced/doc/scene";
import { exportTokenBundle, importTokenBundleIntoDoc, type TokenBundle } from "../src/advanced/ui/tokenRoundtrip";

describe("token roundtrip", () => {
  it("exports styles, variables, modes, and manifest metadata", () => {
    const doc = createDoc();
    doc.styles = [{ id: "fill_primary", name: "Primary", type: "fill", value: { color: "#111111" } }];
    doc.variables = [{ id: "color_primary", name: "Primary Color", type: "color", value: "#111111" }];
    doc.variableModes = ["Light", "Dark"];
    doc.variableMode = "Dark";

    const bundle = exportTokenBundle(doc);

    expect(bundle.version).toBe(1);
    expect(bundle.styles).toHaveLength(1);
    expect(bundle.variables).toHaveLength(1);
    expect(bundle.variableModes).toEqual(["Light", "Dark"]);
    expect(bundle.activeMode).toBe("Dark");
    expect(bundle.manifest.styleCount).toBe(1);
    expect(bundle.manifest.variableCount).toBe(1);
    expect(typeof bundle.manifest.exportedAt).toBe("string");
  });

  it("preserves semantic token refs during replace imports and updates values", () => {
    const doc = createDoc();
    doc.styles = [
      { id: "fill_primary", name: "Primary", type: "fill", value: { color: "#111111" } },
      { id: "text_heading", name: "Heading", type: "text", value: { fontSize: 16 } },
      { id: "effect_soft", name: "Soft Shadow", type: "effect", value: [{ type: "shadow", x: 0, y: 2, blur: 8, color: "#000000" }] },
    ];
    doc.variables = [{ id: "color_primary", name: "Primary Color", type: "color", value: "#111111", modes: { Dark: "#ffffff" } }];
    doc.variableModes = ["Light"];
    doc.variableMode = "Light";

    const rect = createNode("rect");
    rect.style.fillStyleId = "fill_primary";
    rect.style.effectStyleId = "effect_soft";
    rect.style.fillRef = "color_primary";
    rect.overrides = {
      style: {
        ...rect.style,
        fillStyleId: "fill_primary",
        fillRef: "color_primary",
      },
    };

    const text = createNode("text");
    text.text = {
      ...(text.text ?? { value: "", style: { fontFamily: "Arial", fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, align: "left" } }),
      value: "Headline",
      styleRef: "text_heading",
    };
    text.overrides = {
      text: {
        ...(text.text ?? { value: "", style: { fontFamily: "Arial", fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, align: "left" } }),
        styleRef: "text_heading",
      },
    };

    addNode(doc, rect, doc.pages[0]!.rootId);
    addNode(doc, text, doc.pages[0]!.rootId);

    const bundle: TokenBundle = {
      version: 1,
      styles: [
        { id: "fill_new", name: "Primary", type: "fill", value: { color: "#2563eb" } },
        { id: "text_new", name: "Heading", type: "text", value: { fontSize: 20 } },
        { id: "effect_new", name: "Soft Shadow", type: "effect", value: [{ type: "shadow", x: 0, y: 4, blur: 12, color: "#111111" }] },
      ],
      variables: [{ id: "var_new", name: "Primary Color", type: "color", value: "#2563eb", modes: { Dark: "#93c5fd" } }],
      variableModes: ["Light", "Dark"],
      activeMode: "Dark",
      manifest: {
        exportedAt: "2026-03-13T00:00:00.000Z",
        styleCount: 3,
        variableCount: 1,
      },
    };

    const next = importTokenBundleIntoDoc(doc, bundle, "replace");
    const nextRect = next.nodes[rect.id]!;
    const nextText = next.nodes[text.id]!;

    expect(next.styles.map((style) => style.id)).toEqual(["fill_primary", "text_heading", "effect_soft"]);
    expect(next.variables.map((variable) => variable.id)).toEqual(["color_primary"]);
    expect(next.styles.find((style) => style.id === "fill_primary")?.value).toEqual({ color: "#2563eb" });
    expect(next.variables.find((variable) => variable.id === "color_primary")?.modes).toEqual({ Dark: "#93c5fd" });
    expect(nextRect.style.fillStyleId).toBe("fill_primary");
    expect(nextRect.style.effectStyleId).toBe("effect_soft");
    expect(nextRect.style.fillRef).toBe("color_primary");
    expect(nextRect.overrides?.style?.fillStyleId).toBe("fill_primary");
    expect(nextRect.overrides?.style?.fillRef).toBe("color_primary");
    expect(nextText.text?.styleRef).toBe("text_heading");
    expect(nextText.overrides?.text?.styleRef).toBe("text_heading");
    expect(next.variableModes).toEqual(["Light", "Dark"]);
    expect(next.variableMode).toBe("Dark");
  });

  it("merges semantic matches without duplicating ids", () => {
    const doc = createDoc();
    doc.styles = [
      { id: "fill_primary", name: "Primary", type: "fill", value: { color: "#111111" } },
      { id: "fill_secondary", name: "Secondary", type: "fill", value: { color: "#666666" } },
    ];
    doc.variables = [{ id: "space_md", name: "Spacing / md", type: "number", value: 16 }];

    const node = createNode("rect");
    node.style.fillStyleId = "fill_primary";
    addNode(doc, node, doc.pages[0]!.rootId);

    const bundle: TokenBundle = {
      version: 1,
      styles: [{ id: "fill_new", name: "Primary", type: "fill", value: { color: "#0f172a" } }],
      variables: [{ id: "space_new", name: "Spacing / md", type: "number", value: 20 }],
      variableModes: [],
      activeMode: null,
      manifest: {
        exportedAt: "2026-03-13T00:00:00.000Z",
        styleCount: 1,
        variableCount: 1,
      },
    };

    const next = importTokenBundleIntoDoc(doc, bundle, "merge");

    expect(next.styles).toHaveLength(2);
    expect(next.styles.find((style) => style.id === "fill_primary")?.value).toEqual({ color: "#0f172a" });
    expect(next.variables).toHaveLength(1);
    expect(next.variables[0]?.id).toBe("space_md");
    expect(next.variables[0]?.value).toBe(20);
    expect(next.nodes[node.id]?.style.fillStyleId).toBe("fill_primary");
  });

  it("clears refs that no longer exist after replace import", () => {
    const doc = createDoc();
    doc.styles = [{ id: "fill_primary", name: "Primary", type: "fill", value: { color: "#111111" } }];
    doc.variables = [{ id: "color_primary", name: "Primary Color", type: "color", value: "#111111" }];

    const node = createNode("rect");
    node.style.fillStyleId = "fill_primary";
    node.style.fillRef = "color_primary";
    addNode(doc, node, doc.pages[0]!.rootId);

    const next = importTokenBundleIntoDoc(
      doc,
      {
        version: 1,
        styles: [],
        variables: [],
        variableModes: [],
        activeMode: null,
        manifest: {
          exportedAt: "2026-03-13T00:00:00.000Z",
          styleCount: 0,
          variableCount: 0,
        },
      },
      "replace",
    );

    expect(next.styles).toEqual([]);
    expect(next.variables).toEqual([]);
    expect(next.nodes[node.id]?.style.fillStyleId).toBeUndefined();
    expect(next.nodes[node.id]?.style.fillRef).toBeUndefined();
  });

  it("rebinds text bindings, gradient stop refs, and alias targets during replace import", () => {
    const doc = createDoc();
    doc.variables = [
      { id: "label_text", name: "Label", type: "string", value: "Publish" },
      { id: "font_size", name: "Font Size", type: "number", value: 16 },
      { id: "color_primary", name: "Primary Color", type: "color", value: "#111111" },
      { id: "color_alias", name: "Alias Color", type: "color", value: "#111111", aliasOf: "color_primary", modeAliases: { Dark: "color_primary" } },
    ];
    doc.variableModes = ["Light", "Dark"];
    doc.variableMode = "Dark";

    const text = createNode("text");
    text.text = {
      ...(text.text ?? { value: "", style: { fontFamily: "Arial", fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, align: "left" } }),
      value: "Fallback",
      valueRef: "label_text",
      styleBindings: { fontSize: "font_size" },
      ranges: [{ start: 0, end: 4, fillRef: "color_alias" }],
    };
    addNode(doc, text, doc.pages[0]!.rootId);

    const rect = createNode("rect");
    rect.style.fills = [{ type: "linear", from: "#111111", to: "#ffffff", angle: 0, stops: [{ offset: 0, color: "#111111", colorRef: "color_alias" }, { offset: 1, color: "#ffffff", colorRef: "color_primary" }] }];
    addNode(doc, rect, doc.pages[0]!.rootId);

    const bundle: TokenBundle = {
      version: 1,
      styles: [],
      variables: [
        { id: "next_label", name: "Label", type: "string", value: "Deploy" },
        { id: "next_size", name: "Font Size", type: "number", value: 24 },
        { id: "next_primary", name: "Primary Color", type: "color", value: "#2563eb" },
        { id: "next_alias", name: "Alias Color", type: "color", value: "#2563eb", aliasOf: "next_primary", modeAliases: { Dark: "next_primary" } },
      ],
      variableModes: ["Light", "Dark"],
      activeMode: "Dark",
      manifest: {
        exportedAt: "2026-03-13T00:00:00.000Z",
        styleCount: 0,
        variableCount: 4,
      },
    };

    const next = importTokenBundleIntoDoc(doc, bundle, "replace");
    const nextText = next.nodes[text.id]!;
    const nextRect = next.nodes[rect.id]!;
    const nextAlias = next.variables.find((variable) => variable.id === "color_alias");

    expect(nextText.text?.valueRef).toBe("label_text");
    expect(nextText.text?.styleBindings?.fontSize).toBe("font_size");
    expect(nextText.text?.ranges?.[0]?.fillRef).toBe("color_alias");
    expect(nextRect.style.fills[0]).toMatchObject({
      type: "linear",
      stops: [
        expect.objectContaining({ colorRef: "color_alias" }),
        expect.objectContaining({ colorRef: "color_primary" }),
      ],
    });
    expect(nextAlias?.aliasOf).toBe("color_primary");
    expect(nextAlias?.modeAliases).toEqual({ Dark: "color_primary" });
  });
});
