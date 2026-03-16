import { addNode, createDoc, createNode, DEFAULT_TEXT_STYLE, type Doc } from "../src/advanced/doc/scene";

export type FixtureId = "tokens-basic" | "layout-wrap" | "vector-boolean" | "component-variant" | "text-rich";

export const REPRESENTATIVE_FIXTURE_IDS: FixtureId[] = [
  "tokens-basic",
  "layout-wrap",
  "vector-boolean",
  "component-variant",
  "text-rich",
];

export function buildTokenFixtureDoc(): Doc {
  const doc = createDoc();
  doc.styles = [
    { id: "fill_primary", name: "Primary", type: "fill", value: { color: "#2563eb" } },
    { id: "text_heading", name: "Heading", type: "text", value: { fontSize: 24, fontWeight: 700 } },
    { id: "effect_soft", name: "Soft Shadow", type: "effect", value: [{ type: "shadow", x: 0, y: 4, blur: 12, color: "#0f172a" }] },
  ];
  doc.variables = [
    { id: "color_primary", name: "Primary Color", type: "color", value: "#2563eb", modes: { Dark: "#93c5fd" } },
    { id: "space_md", name: "Spacing / md", type: "number", value: 16, modes: { Compact: 12 } },
  ];
  doc.variableModes = ["Light", "Dark", "Compact"];
  doc.variableMode = "Dark";

  const card = createNode("rect", {
    name: "Token Card",
    frame: { x: 40, y: 40, w: 240, h: 140, rotation: 0 },
  });
  card.style.fillStyleId = "fill_primary";
  card.style.effectStyleId = "effect_soft";
  card.style.fillRef = "color_primary";
  addNode(doc, card, doc.pages[0]!.rootId);

  const headline = createNode("text", {
    name: "Headline",
    frame: { x: 56, y: 64, w: 180, h: 48, rotation: 0 },
  });
  headline.text = {
    value: "Figma Grade",
    style: { ...DEFAULT_TEXT_STYLE, fontSize: 24, fontWeight: 700 },
    styleRef: "text_heading",
    wrap: true,
    autoSize: false,
  };
  addNode(doc, headline, doc.pages[0]!.rootId);

  return doc;
}

export function buildLayoutFixtureDoc(): Doc {
  const doc = createDoc();
  const container = createNode("frame", {
    name: "Wrap Stack",
    frame: { x: 40, y: 40, w: 260, h: 120, rotation: 0 },
    layout: {
      mode: "auto",
      dir: "row",
      gap: 16,
      gapMode: "fixed",
      justify: "start",
      padding: { t: 12, r: 12, b: 12, l: 12 },
      align: "center",
      wrap: true,
      wrapGap: 12,
      wrapAlign: "start",
      includeStrokeInBounds: true,
    },
    clipContent: true,
    overflowScrolling: "horizontal",
  });
  addNode(doc, container, doc.pages[0]!.rootId);

  const chipA = createNode("rect", { name: "Chip A", frame: { x: 0, y: 0, w: 96, h: 32, rotation: 0 } });
  const chipB = createNode("rect", { name: "Chip B", frame: { x: 0, y: 0, w: 110, h: 32, rotation: 0 } });
  const chipC = createNode("rect", { name: "Chip C", frame: { x: 0, y: 0, w: 84, h: 32, rotation: 0 } });
  chipA.layoutSizing = { width: "fixed", height: "fixed" };
  chipB.layoutSizing = { width: "fill", height: "fixed", minWidth: 90, maxWidth: 140 };
  chipC.layoutSizing = { width: "fixed", height: "fixed" };
  addNode(doc, chipA, container.id);
  addNode(doc, chipB, container.id);
  addNode(doc, chipC, container.id);

  return doc;
}

export function buildVectorFixtureDoc(): Doc {
  const doc = createDoc();
  const path = createNode("path", {
    name: "Boolean Path",
    frame: { x: 48, y: 48, w: 120, h: 96, rotation: 0 },
    shape: {
      pathData: "M 0 0 L 80 0 L 80 60 L 0 60 Z",
      booleanMeta: {
        op: "union",
        source: "editor",
        operands: [
          { sourceId: "rect_a", name: "Rect A", type: "rect", pathData: "M 0 0 L 48 0 L 48 60 L 0 60 Z" },
          { sourceId: "rect_b", name: "Rect B", type: "rect", pathData: "M 32 0 L 80 0 L 80 60 L 32 60 Z" },
        ],
        },
      vectorNetwork: {
        vertices: [
          { id: "v0", x: 0, y: 0 },
          { id: "v1", x: 80, y: 0 },
          { id: "v2", x: 80, y: 60 },
          { id: "v3", x: 0, y: 60 },
        ],
        segments: [
          { id: "s0", from: "v0", to: "v1" },
          { id: "s1", from: "v1", to: "v2" },
          { id: "s2", from: "v2", to: "v3" },
          { id: "s3", from: "v3", to: "v0" },
        ],
        paths: [{ id: "p0", vertexIds: ["v0", "v1", "v2", "v3"], closed: true, fills: [{ type: "solid", color: "#22c55e" }] }],
      },
    },
  });
  addNode(doc, path, doc.pages[0]!.rootId);
  return doc;
}

export function buildComponentFixtureDoc(): Doc {
  const doc = createDoc();
  const component = createNode("component", {
    id: "component_button",
    name: "Button",
    frame: { x: 40, y: 40, w: 160, h: 56, rotation: 0 },
    componentId: "button_component",
    variants: [
      { id: "variant_primary", name: "Primary", rootId: "component_button", props: { Tone: "Primary", Size: "M" } },
      { id: "variant_secondary", name: "Secondary", rootId: "component_button_alt", props: { Tone: "Secondary", Size: "M" } },
    ],
    propertyDefinitions: {
      label_text: { kind: "text", name: "Label" },
      icon_swap: { kind: "instance", name: "Icon" },
    },
  });
  addNode(doc, component, doc.pages[0]!.rootId);

  const label = createNode("text", {
    id: "component_button_label",
    name: "Label",
    frame: { x: 16, y: 16, w: 72, h: 24, rotation: 0 },
    sourceId: "label_text",
  });
  label.text = { value: "Continue", style: { ...DEFAULT_TEXT_STYLE }, wrap: false, autoSize: true };
  addNode(doc, label, component.id);

  const altVariant = createNode("component", {
    id: "component_button_alt",
    name: "Button / Secondary",
    frame: { x: 220, y: 40, w: 160, h: 56, rotation: 0 },
    componentId: "button_component",
  });
  addNode(doc, altVariant, doc.pages[0]!.rootId);

  const instance = createNode("instance", {
    id: "instance_button",
    name: "Button Instance",
    frame: { x: 40, y: 140, w: 160, h: 56, rotation: 0 },
    instanceOf: component.id,
    variantId: "variant_primary",
    overrides: {
      text: { value: "Deploy", style: { ...DEFAULT_TEXT_STYLE }, wrap: false, autoSize: true },
    },
  });
  addNode(doc, instance, doc.pages[0]!.rootId);

  doc.components = {
    button_component: component.id,
  };

  return doc;
}

export function buildTextRichFixtureDoc(): Doc {
  const doc = createDoc();

  const richText = createNode("text", {
    id: "fixture_text_rich",
    name: "Rich Paragraph Copy",
    frame: { x: 40, y: 40, w: 260, h: 120, rotation: 0 },
  });
  richText.text = {
    value: "Hello brave\nNew world",
    style: {
      ...DEFAULT_TEXT_STYLE,
      fontFamily: "Inter, sans-serif",
      fontSize: 20,
      fontWeight: 400,
      lineHeight: 1.4,
      paragraphSpacing: 18,
    },
    wrap: true,
    autoSize: false,
    ranges: [
      { start: 0, end: 5, style: { fontWeight: 700 } },
      { start: 12, end: 17, style: { italic: true }, fill: "#ef4444" },
    ],
  };
  addNode(doc, richText, doc.pages[0]!.rootId);

  const curvedText = createNode("text", {
    id: "fixture_text_path",
    name: "Curved Label",
    frame: { x: 40, y: 180, w: 240, h: 80, rotation: 0 },
  });
  curvedText.text = {
    value: "Text on path",
    style: {
      ...DEFAULT_TEXT_STYLE,
      fontFamily: "Inter, sans-serif",
      fontSize: 18,
      fontWeight: 600,
    },
    wrap: false,
    autoSize: false,
    textPath: {
      pathData: "M 12 44 C 76 4 144 4 208 44",
      startOffset: 20,
      side: "left",
    },
  };
  addNode(doc, curvedText, doc.pages[0]!.rootId);

  return doc;
}

export function buildRepresentativeFixtureDoc(id: FixtureId): Doc {
  switch (id) {
    case "tokens-basic":
      return buildTokenFixtureDoc();
    case "layout-wrap":
      return buildLayoutFixtureDoc();
    case "vector-boolean":
      return buildVectorFixtureDoc();
    case "component-variant":
      return buildComponentFixtureDoc();
    case "text-rich":
      return buildTextRichFixtureDoc();
  }
}
