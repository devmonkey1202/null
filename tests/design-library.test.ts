import { describe, expect, it } from "vitest";

import { addNode, createDoc, createNode, type Doc, type Node, type StyleToken, type Variable } from "@/advanced/doc/scene";
import {
  buildDesignLibrarySnapshot,
  buildDesignLibraryUpdatePreview,
  computeDesignLibraryUsage,
  consumeDesignLibrary,
  markLibraryUpdateAvailable,
} from "@/advanced/ui/designLibrary";

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
      styleRef: "text_body",
    },
  });
  component.children = [variantRoot.id];
  component.variants = [{ id: "variant_card_default", name: "Default", rootId: variantRoot.id, props: { State: "Default" } }];
  component.propertyDefinitions = {
    [title.id]: { kind: "text", name: "Title" },
  };
  variantRoot.children = [title.id];
  variantRoot.style.fillStyleId = "fill_primary";
  variantRoot.style.fillRef = "var_brand";
  addNode(doc, component, doc.root);
  addNode(doc, variantRoot, component.id);
  addNode(doc, title, variantRoot.id);
  doc.components[component.id] = component.id;
  return { component, variantRoot, title };
}

function addLibraryTokens(doc: Doc) {
  const fill: StyleToken = { id: "fill_primary", name: "Fill / Primary", type: "fill", value: [{ type: "solid", color: "#111827" }] };
  const text: StyleToken = {
    id: "text_body",
    name: "Text / Body",
    type: "text",
    value: {
      fontFamily: "Space Grotesk, sans-serif",
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: 0,
      paragraphSpacing: 0,
      align: "left",
    },
  };
  const variable: Variable = {
    id: "var_brand",
    name: "Brand / Primary",
    type: "color",
    value: "#111827",
    modes: { Default: "#111827", Dark: "#f9fafb" },
  };
  doc.styles = [fill, text];
  doc.variables = [variable];
  doc.variableModes = ["Default", "Dark"];
}

describe("design library", () => {
  it("publishes and consumes components, styles, and variables with library metadata", () => {
    const source = createDoc();
    addLibraryTokens(source);
    addComponentFixture(source);

    const snapshot = buildDesignLibrarySnapshot(source, {
      name: "Core UI",
      libraryId: "lib_core",
      versionId: "libver_1",
      publishedAt: "2026-03-14T00:00:00.000Z",
    });

    expect(snapshot.schema).toBe("null_design_library_v1");
    expect(snapshot.manifest.componentKeys).toHaveLength(1);
    expect(snapshot.styles.every((style) => style.sourceLibraryId === "lib_core")).toBe(true);
    const publishedRoot = snapshot.components[0]?.nodes[snapshot.components[0]!.publishedKey];
    expect(publishedRoot?.sourceLibraryId).toBe("lib_core");
    const publishedText = Object.values(snapshot.components[0]!.nodes).find((node) => node.type === "text");
    expect(publishedText?.text?.styleRef).toBe(snapshot.styles.find((style) => style.id === "text_body")?.publishedKey);

    const consumed = consumeDesignLibrary(createDoc(), snapshot);
    expect(consumed.libraries?.[0]).toMatchObject({
      id: "lib_core",
      currentVersionId: "libver_1",
      status: "up-to-date",
    });
    const importedComponent = Object.values(consumed.nodes).find(
      (node) => node.type === "component" && node.sourceLibraryId === "lib_core",
    );
    expect(importedComponent).toBeTruthy();
    expect(importedComponent?.parentId).toBe(consumed.root);
    expect(consumed.components[importedComponent!.id]).toBe(importedComponent!.id);
    const importedTextNode = Object.values(consumed.nodes).find(
      (node) => node.type === "text" && node.sourceLibraryId === "lib_core",
    );
    const importedTextStyle = consumed.styles.find((style) => style.sourceLibraryId === "lib_core" && style.type === "text");
    expect(importedTextNode?.text?.styleRef).toBe(importedTextStyle?.id);
    const importedVariable = consumed.variables.find((variable) => variable.sourceLibraryId === "lib_core");
    const importedVariantRoot = importedComponent?.variants?.[0]?.rootId ? consumed.nodes[importedComponent.variants[0].rootId] : null;
    expect(importedVariantRoot?.style.fillRef).toBe(importedVariable?.id);
    expect(importedComponent?.propertyDefinitions ? Object.keys(importedComponent.propertyDefinitions).length : 0).toBe(1);
  });

  it("previews updates and preserves local ids when applying a newer library version", () => {
    const source = createDoc();
    addLibraryTokens(source);
    const { title } = addComponentFixture(source);
    const snapshotV1 = buildDesignLibrarySnapshot(source, {
      name: "Core UI",
      libraryId: "lib_core",
      versionId: "libver_1",
      publishedAt: "2026-03-14T00:00:00.000Z",
    });
    const consumedV1 = consumeDesignLibrary(createDoc(), snapshotV1);
    const importedComponent = Object.values(consumedV1.nodes).find(
      (node) => node.type === "component" && node.sourceLibraryId === "lib_core",
    )!;
    const importedStyle = consumedV1.styles.find((style) => style.sourceLibraryId === "lib_core" && style.type === "fill")!;
    const importedVariable = consumedV1.variables.find((variable) => variable.sourceLibraryId === "lib_core")!;

    source.styles[0] = { ...source.styles[0]!, value: [{ type: "solid", color: "#2563eb" }] };
    source.variables[0] = { ...source.variables[0]!, value: "#2563eb" };
    (source.nodes[title.id] as Node).text = {
      ...source.nodes[title.id]!.text!,
      value: "Updated title",
    };

    const snapshotV2 = buildDesignLibrarySnapshot(source, {
      name: "Core UI",
      libraryId: "lib_core",
      versionId: "libver_2",
      publishedAt: "2026-03-15T00:00:00.000Z",
    });
    const preview = buildDesignLibraryUpdatePreview(consumedV1, snapshotV2);
    expect(preview.hasChanges).toBe(true);
    expect(preview.components.updated.length).toBeGreaterThan(0);
    expect(preview.styles.updated.length).toBeGreaterThan(0);
    expect(preview.variables.updated.length).toBeGreaterThan(0);

    const marked = markLibraryUpdateAvailable(consumedV1, preview);
    expect(marked.libraries?.find((library) => library.id === "lib_core")?.status).toBe("update-available");

    const consumedV2 = consumeDesignLibrary(consumedV1, snapshotV2);
    const updatedComponent = Object.values(consumedV2.nodes).find(
      (node) => node.type === "component" && node.sourceLibraryId === "lib_core",
    )!;
    const updatedStyle = consumedV2.styles.find((style) => style.sourceLibraryId === "lib_core" && style.type === "fill")!;
    const updatedVariable = consumedV2.variables.find((variable) => variable.sourceLibraryId === "lib_core")!;

    expect(updatedComponent.id).toBe(importedComponent.id);
    expect(updatedStyle.id).toBe(importedStyle.id);
    expect(updatedVariable.id).toBe(importedVariable.id);
    expect(consumedV2.libraries?.find((library) => library.id === "lib_core")?.currentVersionId).toBe("libver_2");
  });

  it("tracks component, instance, style, and variable usage for consumed libraries", () => {
    const source = createDoc();
    addLibraryTokens(source);
    addComponentFixture(source);
    const snapshot = buildDesignLibrarySnapshot(source, {
      name: "Core UI",
      libraryId: "lib_core",
      versionId: "libver_1",
    });
    const consumed = consumeDesignLibrary(createDoc(), snapshot);
    const libraryComponent = Object.values(consumed.nodes).find(
      (node) => node.type === "component" && node.sourceLibraryId === "lib_core",
    )!;
    const libraryFill = consumed.styles.find((style) => style.sourceLibraryId === "lib_core" && style.type === "fill")!;
    const libraryVariable = consumed.variables.find((variable) => variable.sourceLibraryId === "lib_core")!;
    const page = consumed.pages[0]!;
    const card = createNode("rect", {
      id: "usage_rect",
      parentId: page.rootId,
      frame: { x: 40, y: 40, w: 120, h: 80, rotation: 0 },
    });
    card.style.fillStyleId = libraryFill.id;
    card.style.fillRef = libraryVariable.id;
    addNode(consumed, card, page.rootId);
    const instance = createNode("instance", {
      id: "usage_instance",
      parentId: page.rootId,
      frame: { x: 200, y: 40, w: 240, h: 120, rotation: 0 },
      instanceOf: libraryComponent.id,
      sourceId: libraryComponent.id,
      instanceLibraryId: "lib_core",
    });
    addNode(consumed, instance, page.rootId);

    const usage = computeDesignLibraryUsage(consumed, "lib_core");
    expect(usage.componentDefinitions).toBe(1);
    expect(usage.componentInstances).toBe(1);
    expect(usage.styleRefs).toBeGreaterThanOrEqual(1);
    expect(usage.variableRefs).toBeGreaterThanOrEqual(1);
  });
});
