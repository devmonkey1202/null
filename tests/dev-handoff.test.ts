import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode, type Doc, type Node, type StyleToken, type Variable } from "@/advanced/doc/scene";
import {
  buildComponentPlaygroundPreview,
  buildSpecDiffSections,
  createDevAnnotation,
  createDevCodeLink,
  findComparableVersionNode,
  removeDevAnnotation,
  removeDevCodeLink,
  setNodeReadyForDev,
  upsertDevAnnotation,
  upsertDevCodeLink,
} from "@/advanced/ui/devHandoff";

function addLibraryTokens(doc: Doc) {
  const fill: StyleToken = { id: "fill_primary", name: "Fill / Primary", type: "fill", value: [{ type: "solid", color: "#111827" }] };
  const variable: Variable = {
    id: "var_brand",
    name: "Brand / Primary",
    type: "color",
    value: "#111827",
    modes: { Default: "#111827", Dark: "#f9fafb" },
  };
  doc.styles = [fill];
  doc.variables = [variable];
}

function addComponentFixture(doc: Doc) {
  const component = createNode("component", {
    id: "component_card",
    name: "Card",
    parentId: doc.root,
    frame: { x: 0, y: 0, w: 240, h: 120, rotation: 0 },
  });
  const variantRoot = createNode("frame", {
    id: "component_card_root",
    name: "Card Root",
    parentId: component.id,
    frame: { x: 0, y: 0, w: 240, h: 120, rotation: 0 },
  });
  variantRoot.style.fillStyleId = "fill_primary";
  variantRoot.style.fillRef = "var_brand";
  const title = createNode("text", {
    id: "component_card_title",
    name: "Title",
    parentId: variantRoot.id,
    frame: { x: 24, y: 20, w: 120, h: 28, rotation: 0 },
    text: {
      value: "Library title",
      style: {
        fontFamily: "Space Grotesk, sans-serif",
        fontSize: 24,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: 0,
        paragraphSpacing: 0,
        align: "left",
      },
    },
  });
  const badge = createNode("rect", {
    id: "component_card_badge",
    name: "Badge",
    parentId: variantRoot.id,
    frame: { x: 180, y: 16, w: 40, h: 20, rotation: 0 },
  });
  component.children = [variantRoot.id];
  component.variants = [{ id: "variant_default", name: "Default", rootId: variantRoot.id, props: { State: "Default" } }];
  component.propertyDefinitions = {
    [title.id]: { kind: "text", name: "Title" },
    [badge.id]: { kind: "boolean", name: "Show badge" },
  };
  variantRoot.children = [title.id, badge.id];
  addNode(doc, component, doc.root);
  addNode(doc, variantRoot, component.id);
  addNode(doc, title, variantRoot.id);
  addNode(doc, badge, variantRoot.id);
  doc.components[component.id] = component.id;
  return { component, variantRoot, title, badge };
}

describe("dev handoff", () => {
  it("adds ready-for-dev metadata, annotations, and code links", () => {
    const doc = createDoc();
    const node = createNode("rect", { id: "rect_a", parentId: doc.pages[0]!.rootId });
    addNode(doc, node, doc.pages[0]!.rootId);

    const readyNode = setNodeReadyForDev(node, true);
    expect(readyNode.dev?.readyForDev).toBe(true);

    const annotation = createDevAnnotation("Check spacing", "todo");
    const annotatedNode = upsertDevAnnotation(readyNode, annotation);
    expect(annotatedNode.dev?.annotations).toHaveLength(1);

    const codeLink = createDevCodeLink({ title: "Button.tsx", kind: "react", url: "https://example.com/Button.tsx" });
    const linkedNode = upsertDevCodeLink(annotatedNode, codeLink);
    expect(linkedNode.dev?.codeLinks).toHaveLength(1);

    const removedAnnotation = removeDevAnnotation(linkedNode, annotation.id);
    const removedCodeLink = removeDevCodeLink(removedAnnotation, codeLink.id);
    expect(removedCodeLink.dev?.annotations).toHaveLength(0);
    expect(removedCodeLink.dev?.codeLinks).toHaveLength(0);
  });

  it("builds comparable spec diffs and finds version nodes by source identity", () => {
    const previous = {
      meta: { id: "a", name: "Title" },
      style: { fill: "#111111" },
      text: { value: "Old" },
    };
    const current = {
      meta: { id: "a", name: "Title" },
      style: { fill: "#2563eb" },
      text: { value: "New" },
    };
    const diff = buildSpecDiffSections(previous, current).filter((section) => section.changed);
    expect(diff.map((section) => section.key)).toEqual(["style", "text"]);

    const versionDoc = createDoc();
    const versionNode = createNode("text", {
      id: "version_title",
      parentId: versionDoc.pages[0]!.rootId,
      sourceId: "component_card_title",
    });
    addNode(versionDoc, versionNode, versionDoc.pages[0]!.rootId);
    const currentNode = createNode("text", {
      id: "instance_title",
      parentId: versionDoc.pages[0]!.rootId,
      sourceId: "component_card_title",
    });
    expect(findComparableVersionNode(versionDoc, currentNode)?.id).toBe("version_title");
  });

  it("builds a component playground preview with live property overrides", () => {
    const doc = createDoc();
    addLibraryTokens(doc);
    const { component, badge } = addComponentFixture(doc);

    const preview = buildComponentPlaygroundPreview(doc, component.id, {
      textProps: { component_card_title: "Playground Title" },
      booleanProps: { [badge.id]: false },
    });

    expect(preview).toBeTruthy();
    expect(preview?.componentId).toBe(component.id);
    expect(preview?.variants).toHaveLength(1);
    const previewInstance = preview ? preview.doc.nodes[preview.previewNodeId] : null;
    expect(previewInstance?.type).toBe("instance");
    const previewTitle = preview
      ? Object.values(preview.doc.nodes).find((node) => node.sourceId === "component_card_title")
      : null;
    const previewBadge = preview
      ? Object.values(preview.doc.nodes).find((node) => node.sourceId === badge.id)
      : null;
    expect(previewTitle?.text?.value).toBe("Playground Title");
    expect(previewBadge?.hidden).toBe(true);
  });
});
