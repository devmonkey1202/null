import { describe, expect, it } from "vitest";

import { DEFAULT_TEXT_STYLE, addNode, createDoc, createNode, hydrateDoc, type Doc } from "../src/advanced/doc/scene";
import type { FigmaLocalVariablesResponse, FigmaNode } from "../src/lib/figma";
import { figmaNodesToNullDoc } from "../src/lib/figmaToNull";
import { nullDocToFigmaPayload } from "../src/lib/nullToFigma";
import {
  buildComponentFixtureDoc,
  buildLayoutFixtureDoc,
  buildTokenFixtureDoc,
  buildVectorFixtureDoc,
} from "./figma-fixtures";

function walkFigma(node: FigmaNode, out: FigmaNode[] = []) {
  out.push(node);
  (node.children ?? []).forEach((child) => walkFigma(child, out));
  return out;
}

function importExportedDoc(doc: Doc) {
  const exported = nullDocToFigmaPayload(doc, { fileName: "NULL Roundtrip" });
  const imported = hydrateDoc(
    figmaNodesToNullDoc("null_export", exported.file.document, {
      fileName: exported.file.name,
      figmaStyles: exported.file.styles,
      figmaVariableCollections: exported.localVariables.meta?.variableCollections,
      figmaVariables: exported.localVariables.meta?.variables,
    }),
  );
  return { exported, imported };
}

function getVariableMeta(localVariables: FigmaLocalVariablesResponse) {
  return {
    collections: localVariables.meta?.variableCollections ?? {},
    variables: localVariables.meta?.variables ?? {},
  };
}

describe("nullToFigma", () => {
  it("exports styles, variables, and refs for token fixtures", () => {
    const doc = buildTokenFixtureDoc();
    const { exported, imported } = importExportedDoc(doc);
    const allNodes = walkFigma(exported.file.document);
    const card = allNodes.find((node) => node.name === "Token Card");
    const headline = allNodes.find((node) => node.name === "Headline");
    const variableMeta = getVariableMeta(exported.localVariables);

    expect(Object.keys(exported.file.styles ?? {})).toHaveLength(3);
    expect(Object.keys(variableMeta.variables)).toHaveLength(2);
    expect(card?.styles?.FILL).toBeTruthy();
    expect(card?.styles?.EFFECT).toBeTruthy();
    expect(card?.boundVariables?.fills?.[0]?.id).toContain("color_primary");
    expect(headline?.styles?.TEXT).toBeTruthy();

    const importedCard = Object.values(imported.nodes).find((node) => node.name === "Token Card");
    const importedHeadline = Object.values(imported.nodes).find((node) => node.name === "Headline");
    expect(imported.styles.map((style) => style.name).sort()).toEqual(["Heading", "Primary", "Soft Shadow"]);
    expect(imported.variableModes).toEqual(["Light", "Dark", "Compact"]);
    expect(imported.variables.map((variable) => variable.name).sort()).toEqual(["Primary Color", "Spacing / md"]);
    expect(importedCard?.style.fillStyleId).toBeTruthy();
    expect(importedCard?.style.effectStyleId).toBeTruthy();
    expect(importedCard?.style.fillRef).toBeTruthy();
    expect(importedHeadline?.text?.styleRef).toBeTruthy();
    expect(importedHeadline?.text?.value).toBe("Figma Grade");
  });

  it("exports and roundtrips auto layout sizing", () => {
    const doc = buildLayoutFixtureDoc();
    const { exported, imported } = importExportedDoc(doc);
    const wrapStack = walkFigma(exported.file.document).find((node) => node.name === "Wrap Stack");
    const importedWrapStack = Object.values(imported.nodes).find((node) => node.name === "Wrap Stack");
    const importedChipB = Object.values(imported.nodes).find((node) => node.name === "Chip B");

    expect(wrapStack?.layoutMode).toBe("HORIZONTAL");
    expect(wrapStack?.layoutWrap).toBe("WRAP");
    expect(wrapStack?.itemSpacing).toBe(16);
    expect(wrapStack?.counterAxisSpacing).toBe(12);
    expect(wrapStack?.overflowDirection).toBe("HORIZONTAL_SCROLLING");
    expect(importedWrapStack?.layout?.mode).toBe("auto");
    if (importedWrapStack?.layout?.mode === "auto") {
      expect(importedWrapStack.layout.wrap).toBe(true);
      expect(importedWrapStack.layout.wrapGap).toBe(12);
    }
    expect(importedChipB?.layoutSizing?.width).toBe("fill");
    expect(importedChipB?.layoutSizing?.minWidth).toBe(90);
    expect(importedChipB?.layoutSizing?.maxWidth).toBe(140);
  });

  it("exports and roundtrips Ignore Auto Layout children", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    const frame = createNode("frame", {
      id: "auto_frame",
      name: "Auto Frame",
      frame: { x: 0, y: 0, w: 320, h: 180, rotation: 0 },
      layout: { mode: "auto", dir: "row", gap: 12, padding: { t: 16, r: 16, b: 16, l: 16 }, align: "start", wrap: false },
    });
    addNode(doc, frame, pageId);
    const flowChild = createNode("rect", {
      id: "flow_child",
      name: "Flow Child",
      frame: { x: 0, y: 0, w: 80, h: 40, rotation: 0 },
    });
    const floating = createNode("rect", {
      id: "floating_child",
      name: "Floating Child",
      frame: { x: 180, y: 24, w: 90, h: 60, rotation: 0 },
      layoutPositioning: "absolute",
      constraints: { right: true, top: true },
      layoutSizing: { width: "fill", height: "fixed", minWidth: 90 },
    });
    addNode(doc, flowChild, frame.id);
    addNode(doc, floating, frame.id);

    const { exported, imported } = importExportedDoc(doc);
    const exportedFloating = walkFigma(exported.file.document).find((node) => node.name === "Floating Child");
    const importedFloating = Object.values(imported.nodes).find((node) => node.name === "Floating Child");

    expect(exportedFloating?.layoutPositioning).toBe("ABSOLUTE");
    expect(exportedFloating?.layoutSizingHorizontal).toBe("FIXED");
    expect(exportedFloating?.layoutGrow).toBe(0);
    expect(importedFloating?.layoutPositioning).toBe("absolute");
    expect(importedFloating?.layoutSizing?.width).toBe("fixed");
    expect(importedFloating?.frame).toMatchObject({ x: 180, y: 24, w: 90, h: 60 });
  });

  it("exports and roundtrips grid flow, guide alignment, and grid child placement", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    const frame = createNode("frame", {
      id: "grid_frame",
      name: "Grid Frame",
      frame: { x: 0, y: 0, w: 640, h: 360, rotation: 0 },
      layout: {
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
      },
      layoutGrid: [
        { type: "columns", count: 3, gutter: 24, offset: 24, alignment: "stretch", color: "#4f46e5", opacity: 0.1 },
        { type: "rows", count: 4, height: 56, gutter: 16, offset: 20, alignment: "center", color: "#22c55e", opacity: 0.08 },
      ],
    });
    addNode(doc, frame, pageId);
    const child = createNode("rect", {
      id: "grid_item",
      name: "Grid Item",
      frame: { x: 0, y: 0, w: 120, h: 48, rotation: 0 },
      gridChild: {
        row: 0,
        column: 1,
        rowSpan: 1,
        columnSpan: 2,
        horizontalAlign: "center",
        verticalAlign: "end",
      },
    });
    addNode(doc, child, frame.id);

    const { exported, imported } = importExportedDoc(doc);
    const exportedFrame = walkFigma(exported.file.document).find((node) => node.name === "Grid Frame");
    const exportedChild = walkFigma(exported.file.document).find((node) => node.name === "Grid Item");
    const importedFrame = Object.values(imported.nodes).find((node) => node.name === "Grid Frame");
    const importedChild = Object.values(imported.nodes).find((node) => node.name === "Grid Item");

    expect(exportedFrame).toMatchObject({
      layoutMode: "GRID",
      gridColumnCount: 3,
      gridRowCount: 2,
      gridColumnGap: 24,
      gridRowGap: 18,
      gridColumnsSizing: "120px 1fr 2fr",
      gridRowsSizing: "auto 80px",
    });
    expect(exportedFrame?.layoutGrids).toEqual([
      expect.objectContaining({ pattern: "COLUMNS", alignment: "STRETCH", gutterSize: 24, offset: 24 }),
      expect.objectContaining({ pattern: "ROWS", alignment: "CENTER", sectionSize: 56, gutterSize: 16, offset: 20 }),
    ]);
    expect(exportedChild).toMatchObject({
      gridColumnAnchorIndex: 2,
      gridRowAnchorIndex: 1,
      gridColumnSpan: 2,
      gridRowSpan: 1,
      gridChildHorizontalAlign: "CENTER",
      gridChildVerticalAlign: "MAX",
    });
    expect(importedFrame?.layout).toEqual({
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
    expect(importedFrame?.layoutGrid).toEqual([
      expect.objectContaining({ type: "columns", alignment: "stretch", gutter: 24, offset: 24 }),
      expect.objectContaining({ type: "rows", alignment: "center", height: 56, gutter: 16, offset: 20 }),
    ]);
    expect(importedChild?.gridChild).toEqual({
      row: 0,
      column: 1,
      rowSpan: 1,
      columnSpan: 2,
      horizontalAlign: "center",
      verticalAlign: "end",
    });
  });

  it("exports boolean/vector nodes as editable Figma geometry", () => {
    const doc = buildVectorFixtureDoc();
    const { exported, imported } = importExportedDoc(doc);
    const exportedBoolean = walkFigma(exported.file.document).find((node) => node.name === "Boolean Path");
    const importedPath = Object.values(imported.nodes).find((node) => node.name === "Boolean Path");

    expect(exportedBoolean?.type).toBe("BOOLEAN_OPERATION");
    expect(exportedBoolean?.booleanOperation).toBe("UNION");
    expect(exportedBoolean?.fillGeometry?.length).toBeGreaterThan(0);
    expect(exportedBoolean?.children).toHaveLength(2);
    expect(importedPath?.shape?.booleanMeta?.op).toBe("union");
    expect(importedPath?.shape?.booleanMeta?.operands).toHaveLength(2);
    expect(importedPath?.shape?.vectorNetwork?.paths.length).toBeGreaterThan(0);
  });

  it("exports multi-path vectors as semantic wrapper groups and re-imports them as one editable path node", () => {
    const doc = createDoc();
    const path = createNode("path", {
      id: "multi_vector",
      name: "Multi Vector",
      frame: { x: 48, y: 48, w: 160, h: 96, rotation: 0 },
      shape: {
        segments: [
          {
            d: "M 0 0 L 64 0 L 64 64 L 0 64 Z",
            fills: [{ type: "solid", color: "#ef4444" }],
          },
          {
            d: "M 84 12 L 136 12 L 136 64 L 84 64 Z",
            fills: [{ type: "solid", color: "#3b82f6" }],
          },
        ],
      },
    });
    addNode(doc, path, doc.pages[0]!.rootId);

    const { exported, imported } = importExportedDoc(doc);
    const exportedGroup = walkFigma(exported.file.document).find((node) => node.name === "Multi Vector");
    const importedPath = Object.values(imported.nodes).find((node) => node.name === "Multi Vector");

    expect(exportedGroup?.type).toBe("GROUP");
    expect(exportedGroup?.children?.map((child) => child.name)).toEqual([
      "__NULL_VECTOR_PATH__:segment_0",
      "__NULL_VECTOR_PATH__:segment_1",
    ]);
    expect(exportedGroup?.children?.every((child) => child.type === "VECTOR")).toBe(true);
    expect(importedPath?.type).toBe("path");
    expect(importedPath?.shape?.segments).toHaveLength(2);
    expect(importedPath?.shape?.segments?.map((segment) => segment.fills[0]?.type)).toEqual(["solid", "solid"]);
    expect(importedPath?.shape?.vectorNetwork?.paths.map((vectorPath) => vectorPath.id)).toEqual(["segment_0", "segment_1"]);
  });

  it("exports component set, variants, and instance bindings", () => {
    const doc = buildComponentFixtureDoc();
    const { exported, imported } = importExportedDoc(doc);
    const exportedNodes = walkFigma(exported.file.document);
    const componentSet = exportedNodes.find((node) => node.type === "COMPONENT_SET" && node.name === "Button");
    const instance = exportedNodes.find((node) => node.type === "INSTANCE" && node.name === "Button Instance");
    const importedComponent = Object.values(imported.nodes).find((node) => node.type === "component" && node.name === "Button");
    const importedInstance = Object.values(imported.nodes).find((node) => node.type === "instance" && node.name === "Button Instance");

    expect(componentSet).toBeTruthy();
    expect(componentSet?.children).toHaveLength(2);
    expect(componentSet?.componentPropertyDefinitions).toBeTruthy();
    expect(instance?.componentId).toBeTruthy();
    expect(instance?.componentProperties).toBeTruthy();

    expect(importedComponent?.variants).toHaveLength(2);
    expect(importedComponent?.variants?.some((variant) => variant.props?.Tone === "Primary")).toBe(true);
    expect(importedComponent?.propertyDefinitions).toBeTruthy();
    expect(importedInstance?.instanceOf).toBeTruthy();
    expect(importedInstance?.variantId).toBeTruthy();
  });

  it("exports and re-imports rich text style overrides", () => {
    const doc = createDoc();
    const pageId = doc.pages[0]!.rootId;
    const richText = createNode("text", {
      id: "rich_text",
      name: "Rich Text",
      frame: { x: 40, y: 40, w: 260, h: 64, rotation: 0 },
      text: {
        value: "Hello World",
        style: { ...DEFAULT_TEXT_STYLE, fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, paragraphSpacing: 18 },
        wrap: true,
        autoSize: false,
        ranges: [
          { start: 0, end: 5, style: { fontWeight: 700 } },
          { start: 6, end: 11, style: { italic: true }, fill: "#ff0000" },
        ],
      },
    });
    addNode(doc, richText, pageId);

    const { exported, imported } = importExportedDoc(doc);
    const exportedText = walkFigma(exported.file.document).find((node) => node.name === "Rich Text");
    const importedText = Object.values(imported.nodes).find((node) => node.name === "Rich Text");

    expect(exportedText?.type).toBe("TEXT");
    expect(exportedText?.styleOverrideTable).toBeTruthy();
    expect(exportedText?.characterStyleOverrides?.some((value) => value > 0)).toBe(true);
    expect(exportedText?.style?.paragraphSpacing).toBe(18);
    expect(importedText?.text?.ranges).toHaveLength(2);
    expect(importedText?.text?.style.paragraphSpacing).toBe(18);
    expect(importedText?.text?.ranges?.[0]?.style?.fontWeight).toBe(700);
    expect(importedText?.text?.ranges?.[1]?.style?.italic).toBe(true);
    expect(importedText?.text?.ranges?.[1]?.fill).toBe("#ff0000");
  });

  it("exports and re-imports variable aliases, text bindings, and gradient stop bindings", () => {
    const doc = createDoc();
    doc.variableModes = ["Light", "Dark"];
    doc.variableMode = "Dark";
    doc.variables = [
      { id: "label_text", name: "Label", type: "string", value: "Publish", modes: { Dark: "Deploy" } },
      { id: "font_size", name: "Font Size", type: "number", value: 18, modes: { Dark: 24 } },
      { id: "color_primary", name: "Primary", type: "color", value: "#2563eb", modes: { Dark: "#93c5fd" } },
      {
        id: "color_alias",
        name: "Alias Color",
        type: "color",
        value: "#2563eb",
        aliasOf: "color_primary",
        modeAliases: { Light: "color_primary", Dark: "color_primary" },
      },
    ];

    const textNode = createNode("text", {
      id: "bound_text",
      name: "Bound Text",
      frame: { x: 40, y: 40, w: 220, h: 48, rotation: 0 },
    });
    textNode.text = {
      ...(textNode.text ?? { value: "", style: { ...DEFAULT_TEXT_STYLE } }),
      value: "Fallback",
      valueRef: "label_text",
      styleBindings: { fontSize: "font_size" },
    };
    addNode(doc, textNode, doc.pages[0]!.rootId);

    const gradientNode = createNode("rect", {
      id: "gradient_rect",
      name: "Gradient Rect",
      frame: { x: 40, y: 120, w: 220, h: 80, rotation: 0 },
    });
    gradientNode.style.fills = [
      {
        type: "linear",
        from: "#2563eb",
        to: "#93c5fd",
        angle: 0,
        stops: [
          { offset: 0, color: "#2563eb", colorRef: "color_alias" },
          { offset: 1, color: "#93c5fd", colorRef: "color_primary" },
        ],
      },
    ];
    addNode(doc, gradientNode, doc.pages[0]!.rootId);

    const { exported, imported } = importExportedDoc(doc);
    const exportedNodes = walkFigma(exported.file.document);
    const exportedText = exportedNodes.find((node) => node.name === "Bound Text");
    const exportedGradient = exportedNodes.find((node) => node.name === "Gradient Rect");
    const variableMeta = getVariableMeta(exported.localVariables);
    const aliasVariable = Object.values(variableMeta.variables).find((variable) => variable.name === "Alias Color");

    expect(exportedText?.boundVariables?.characters?.id).toContain("label_text");
    expect(exportedText?.style?.boundVariables?.fontSize?.id).toContain("font_size");
    expect(exportedGradient?.fills?.[0]).toMatchObject({
      type: "GRADIENT_LINEAR",
      gradientStops: [
        expect.objectContaining({ boundVariables: { color: expect.objectContaining({ id: expect.stringContaining("color_alias") }) } }),
        expect.objectContaining({ boundVariables: { color: expect.objectContaining({ id: expect.stringContaining("color_primary") }) } }),
      ],
    });
    expect(aliasVariable?.valuesByMode?.[Object.keys(aliasVariable.valuesByMode ?? {})[0] ?? ""]).toMatchObject({
      type: "VARIABLE_ALIAS",
    });

    const importedText = Object.values(imported.nodes).find((node) => node.name === "Bound Text");
    const importedGradient = Object.values(imported.nodes).find((node) => node.name === "Gradient Rect");
    const importedAlias = imported.variables.find((variable) => variable.name === "Alias Color");

    expect(importedText?.text?.valueRef).toBeTruthy();
    expect(importedText?.text?.styleBindings?.fontSize).toBeTruthy();
    expect(importedGradient?.style.fills[0]).toMatchObject({
      type: "linear",
      stops: [
        expect.objectContaining({ colorRef: expect.any(String) }),
        expect.objectContaining({ colorRef: expect.any(String) }),
      ],
    });
    expect(importedAlias?.aliasOf).toBeTruthy();
    if (!importedAlias?.aliasOf) throw new Error("expected alias import");
    expect(importedAlias?.modeAliases).toEqual({ Light: importedAlias.aliasOf, Dark: importedAlias.aliasOf });
  });

  it("exports and re-imports prototype flows, official interactions, and NULL-only metadata", () => {
    const doc = createDoc();
    const pageOne = doc.pages[0]!;
    pageOne.name = "Page 1";
    const pageTwoId = "page_two";
    doc.pages.push({ id: pageTwoId, name: "Page 2", rootId: pageTwoId });
    const pageTwoRoot = createNode("frame", {
      id: pageTwoId,
      name: "Page 2",
      parentId: doc.root,
      frame: { x: 0, y: 0, w: 1440, h: 1024, rotation: 0 },
    });
    doc.nodes[pageTwoId] = pageTwoRoot;
    doc.nodes[doc.root].children.push(pageTwoId);
    doc.prototype = { startPageId: pageOne.id };

    const targetScreen = createNode("frame", {
      id: "target_screen",
      name: "Target Screen",
      frame: { x: 40, y: 40, w: 320, h: 240, rotation: 0 },
    });
    addNode(doc, targetScreen, pageTwoId);

    const anchor = createNode("rect", {
      id: "scroll_anchor",
      name: "Scroll Anchor",
      frame: { x: 20, y: 180, w: 120, h: 64, rotation: 0 },
    });
    addNode(doc, anchor, pageOne.rootId);

    const trigger = createNode("rect", {
      id: "proto_trigger",
      name: "Prototype Trigger",
      frame: { x: 20, y: 20, w: 160, h: 56, rotation: 0 },
      prototype: {
        interactions: [
          {
            id: "proto_nav",
            trigger: "click",
            action: {
              type: "navigate",
              targetPageId: pageTwoId,
              transition: { type: "smart", duration: 280, easing: "ease-out" },
              delayMs: 120,
            },
          },
          {
            id: "proto_overlay",
            trigger: "hover",
            action: {
              type: "overlay",
              targetPageId: pageTwoId,
              transition: { type: "fade", duration: 180, easing: "ease" },
              position: "bottom-right",
              overlayWidth: 420,
              overlayHeight: 240,
              dim: 0.32,
            },
          },
          {
            id: "proto_url",
            trigger: "click",
            action: {
              type: "url",
              url: "https://example.com/docs",
            },
          },
          {
            id: "proto_scroll",
            trigger: "click",
            action: {
              type: "scrollTo",
              targetNodeId: anchor.id,
              transition: { type: "instant", duration: 0, easing: "linear" },
            },
          },
          {
            id: "proto_setvar",
            trigger: "click",
            action: {
              type: "setVariable",
              variableId: "feature_flag",
              value: true,
            },
          },
        ],
      },
    });
    addNode(doc, trigger, pageOne.rootId);

    const { exported, imported } = importExportedDoc(doc);
    const exportedCanvasOne = exported.file.document.children[0];
    const exportedTrigger = walkFigma(exported.file.document).find((node) => node.name === "Prototype Trigger");
    const importedTrigger = Object.values(imported.nodes).find((node) => node.name === "Prototype Trigger");
    const importedTargetPage = imported.pages.find((page) => page.name === "Page 2");
    const importedAnchor = Object.values(imported.nodes).find((node) => node.name === "Scroll Anchor");

    expect(exportedCanvasOne?.flowStartingPoints).toEqual([
      expect.objectContaining({ name: "Page 1", nodeId: expect.any(String) }),
    ]);
    expect(exportedCanvasOne?.prototypeStartNodeID).toBeTruthy();
    expect(exportedTrigger?.interactions).toHaveLength(4);
    expect(exportedTrigger?.sharedPluginData?.NULL?.prototype).toBeTruthy();
    expect(exportedTrigger?.interactions?.[0]).toMatchObject({
      trigger: { type: "ON_CLICK" },
      actions: [
        expect.objectContaining({
          type: "NODE",
          navigation: "NAVIGATE",
          transition: expect.objectContaining({ type: "SMART_ANIMATE", duration: 280 }),
        }),
      ],
    });
    expect(exportedTrigger?.interactions?.[1]).toMatchObject({
      trigger: { type: "ON_HOVER" },
      actions: [
        expect.objectContaining({
          type: "NODE",
          navigation: "OVERLAY",
          transition: expect.objectContaining({ type: "DISSOLVE", duration: 180 }),
        }),
      ],
    });

    expect(imported.prototype?.startPageId).toBe(imported.pages[0]?.id);
    expect(importedTargetPage).toBeTruthy();
    expect(importedTrigger?.prototype?.interactions).toHaveLength(5);
    expect(importedTrigger?.prototype?.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "proto_nav",
          action: expect.objectContaining({
            type: "navigate",
            targetPageId: importedTargetPage?.id,
            delayMs: 120,
            transition: expect.objectContaining({ type: "smart", duration: 280 }),
          }),
        }),
        expect.objectContaining({
          id: "proto_overlay",
          action: expect.objectContaining({
            type: "overlay",
            targetPageId: importedTargetPage?.id,
            overlayWidth: 420,
            overlayHeight: 240,
            dim: 0.32,
          }),
        }),
        expect.objectContaining({
          id: "proto_url",
          action: expect.objectContaining({
            type: "url",
            url: "https://example.com/docs",
          }),
        }),
        expect.objectContaining({
          id: "proto_scroll",
          action: expect.objectContaining({
            type: "scrollTo",
            targetNodeId: importedAnchor?.id,
          }),
        }),
        expect.objectContaining({
          id: "proto_setvar",
          action: expect.objectContaining({
            type: "setVariable",
            variableId: "feature_flag",
            value: true,
          }),
        }),
      ]),
    );
  });

  it("roundtrips advanced prototype triggers and interactive component variant actions", () => {
    const doc = createDoc();
    const component = createNode("component", {
      id: "proto_component",
      name: "Prototype Component",
      parentId: doc.root,
      frame: { x: 0, y: 0, w: 160, h: 56, rotation: 0 },
    });
    const variantDefaultRoot = createNode("frame", {
      id: "variant_default_root",
      name: "Default Root",
      parentId: component.id,
      frame: { x: 0, y: 0, w: 160, h: 56, rotation: 0 },
    });
    const variantHoverRoot = createNode("frame", {
      id: "variant_hover_root",
      name: "Hover Root",
      parentId: component.id,
      frame: { x: 0, y: 0, w: 160, h: 56, rotation: 0 },
    });
    component.children = [variantDefaultRoot.id, variantHoverRoot.id];
    component.variants = [
      { id: "variant_default", name: "Default", rootId: variantDefaultRoot.id, props: { State: "Default" } },
      { id: "variant_hover", name: "Hover", rootId: variantHoverRoot.id, props: { State: "Hover" } },
    ];
    addNode(doc, component, doc.root);
    addNode(doc, variantDefaultRoot, component.id);
    addNode(doc, variantHoverRoot, component.id);

    const instance = createNode("instance", {
      id: "proto_instance",
      name: "Prototype Instance",
      parentId: doc.pages[0]!.rootId,
      frame: { x: 20, y: 20, w: 160, h: 56, rotation: 0 },
      instanceOf: component.id,
      variantId: "variant_default",
      prototype: {
        interactions: [
          { id: "ia_hover_delay", trigger: "whileHover", hoverDelayMs: 180, action: { type: "setVariant", variantId: "variant_hover", targetNodeId: "proto_instance" } },
          { id: "ia_press", trigger: "onPress", action: { type: "setVariant", variantId: "variant_hover", targetNodeId: "proto_instance" } },
          { id: "ia_drag_start", trigger: "onDragStart", action: { type: "setVariant", variantId: "variant_hover", targetNodeId: "proto_instance" } },
          { id: "ia_drag_end", trigger: "onDragEnd", action: { type: "setVariant", variantId: "variant_default", targetNodeId: "proto_instance" } },
        ],
      },
    });
    addNode(doc, instance, doc.pages[0]!.rootId);

    const { exported, imported } = importExportedDoc(doc);
    const exportedInstance = walkFigma(exported.file.document).find((node) => node.name === "Prototype Instance");
    const importedInstance = Object.values(imported.nodes).find((node) => node.name === "Prototype Instance");

    expect(exportedInstance?.sharedPluginData?.NULL?.prototype).toBeTruthy();
    expect(exportedInstance?.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trigger: { type: "ON_HOVER" } }),
        expect.objectContaining({ trigger: { type: "ON_PRESS" } }),
        expect.objectContaining({ trigger: { type: "ON_DRAG" } }),
      ]),
    );

    expect(importedInstance?.id).toBeTruthy();
    expect(importedInstance?.prototype?.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ia_hover_delay",
          trigger: "whileHover",
          hoverDelayMs: 180,
          action: expect.objectContaining({ type: "setVariant", targetNodeId: importedInstance?.id, variantId: "variant_hover" }),
        }),
        expect.objectContaining({
          id: "ia_press",
          trigger: "onPress",
          action: expect.objectContaining({ type: "setVariant", targetNodeId: importedInstance?.id, variantId: "variant_hover" }),
        }),
        expect.objectContaining({
          id: "ia_drag_start",
          trigger: "onDragStart",
          action: expect.objectContaining({ type: "setVariant", targetNodeId: importedInstance?.id, variantId: "variant_hover" }),
        }),
        expect.objectContaining({
          id: "ia_drag_end",
          trigger: "onDragEnd",
          action: expect.objectContaining({ type: "setVariant", targetNodeId: importedInstance?.id, variantId: "variant_default" }),
        }),
      ]),
    );
    expect(imported.pages.some((page) => page.name === doc.pages[0]!.name)).toBe(true);
  });
});
