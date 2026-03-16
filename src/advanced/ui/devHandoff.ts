import { createDoc, createNode, type DevAnnotation, type DevAnnotationStatus, type DevCodeLink, type DevCodeLinkKind, type Doc, type Node } from "../doc/scene";
import { makeRuntimeId } from "./AdvancedEditor.utils";

export type DevSpecDiffSection = {
  key: string;
  label: string;
  changed: boolean;
  before: string;
  after: string;
};

export type ComponentPlaygroundVariantOption = {
  id: string;
  name: string;
  props?: Record<string, string>;
};

export type ComponentPlaygroundProperty = {
  sourceId: string;
  name: string;
  kind: "text" | "boolean" | "instance";
  textValue?: string;
  booleanValue?: boolean;
  instanceValue?: string;
  instanceOptions?: Array<{ id: string; name: string }>;
};

export type ComponentPlaygroundPreview = {
  doc: Doc;
  previewNodeId: string;
  componentId: string;
  variantId?: string;
  variants: ComponentPlaygroundVariantOption[];
  properties: ComponentPlaygroundProperty[];
};

const SPEC_SECTION_LABELS: Record<string, string> = {
  meta: "Meta",
  component: "Component",
  frame: "Frame",
  absolute: "Absolute",
  spacing: "Spacing",
  style: "Style",
  text: "Text",
  layout: "Layout",
  tokens: "Tokens",
  export: "Export",
  slot: "Slot",
  dev: "Dev",
};

function stableStringify(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function collectSubtree(doc: Doc, nodeId: string, out: string[]) {
  const node = doc.nodes[nodeId];
  if (!node) return;
  out.push(nodeId);
  node.children.forEach((childId) => collectSubtree(doc, childId, out));
}

function findComponentSource(doc: Doc, nodeId: string) {
  const node = doc.nodes[nodeId];
  if (!node) return null;
  if (node.type === "component") return node;
  if (node.type === "instance" && node.instanceOf) {
    const component = doc.nodes[node.instanceOf];
    return component?.type === "component" ? component : null;
  }
  return null;
}

function buildPropertyValueMaps(doc: Doc, node: Node | null) {
  const textValues: Record<string, string> = {};
  const booleanValues: Record<string, boolean> = {};
  const instanceValues: Record<string, string> = {};
  if (!node) return { textValues, booleanValues, instanceValues };
  const ids: string[] = [];
  collectSubtree(doc, node.id, ids);
  ids.forEach((id) => {
    const current = doc.nodes[id];
    if (!current?.sourceId) return;
    if (current.type === "text") textValues[current.sourceId] = current.text?.value ?? "";
    booleanValues[current.sourceId] = !current.hidden;
    if (current.type === "instance" && current.instanceOf) instanceValues[current.sourceId] = current.instanceOf;
  });
  return { textValues, booleanValues, instanceValues };
}

function computeBounds(nodes: Node[]) {
  if (!nodes.length) return { x: 0, y: 0, w: 320, h: 240, rotation: 0 };
  const left = Math.min(...nodes.map((node) => node.frame.x));
  const top = Math.min(...nodes.map((node) => node.frame.y));
  const right = Math.max(...nodes.map((node) => node.frame.x + node.frame.w));
  const bottom = Math.max(...nodes.map((node) => node.frame.y + node.frame.h));
  return {
    x: left,
    y: top,
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
    rotation: 0,
  };
}

export function buildSpecDiffSections(previous: Record<string, unknown> | null, current: Record<string, unknown> | null): DevSpecDiffSection[] {
  const keys = Array.from(new Set([...Object.keys(previous ?? {}), ...Object.keys(current ?? {})]));
  return keys.map((key) => {
    const before = stableStringify(previous?.[key]);
    const after = stableStringify(current?.[key]);
    return {
      key,
      label: SPEC_SECTION_LABELS[key] ?? key,
      changed: before !== after,
      before,
      after,
    };
  });
}

export function findComparableVersionNode(versionDoc: Doc, currentNode: Node) {
  if (versionDoc.nodes[currentNode.id]) return versionDoc.nodes[currentNode.id] ?? null;
  if (currentNode.sourceId) {
    const direct = versionDoc.nodes[currentNode.sourceId];
    if (direct) return direct;
    const bySource = Object.values(versionDoc.nodes).find((node) => node.sourceId === currentNode.sourceId);
    if (bySource) return bySource;
  }
  if (currentNode.publishedKey) {
    const byPublishedKey = Object.values(versionDoc.nodes).find((node) => node.publishedKey === currentNode.publishedKey);
    if (byPublishedKey) return byPublishedKey;
  }
  return (
    Object.values(versionDoc.nodes).find(
      (node) =>
        node.type === currentNode.type &&
        node.name === currentNode.name &&
        node.parentId === currentNode.parentId,
    ) ?? null
  );
}

export function createDevAnnotation(text: string, status: DevAnnotationStatus = "todo"): DevAnnotation {
  const ts = new Date().toISOString();
  return {
    id: makeRuntimeId("devnote"),
    text: text.trim(),
    status,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function upsertDevAnnotation(node: Node, annotation: DevAnnotation): Node {
  const existing = node.dev?.annotations ?? [];
  const index = existing.findIndex((item) => item.id === annotation.id);
  const annotations = index >= 0 ? existing.map((item) => (item.id === annotation.id ? annotation : item)) : [...existing, annotation];
  return {
    ...node,
    dev: {
      ...node.dev,
      status: node.dev?.status ?? (node.dev?.readyForDev ? "ready" : "draft"),
      annotations,
    },
  };
}

export function removeDevAnnotation(node: Node, annotationId: string): Node {
  const annotations = (node.dev?.annotations ?? []).filter((annotation) => annotation.id !== annotationId);
  return {
    ...node,
    dev: {
      ...node.dev,
      annotations,
    },
  };
}

export function createDevCodeLink(input: { title: string; kind?: DevCodeLinkKind; url?: string; snippet?: string; language?: string; exportKey?: string }): DevCodeLink {
  return {
    id: makeRuntimeId("devlink"),
    title: input.title.trim(),
    kind: input.kind ?? "docs",
    url: input.url?.trim() || undefined,
    snippet: input.snippet?.trim() || undefined,
    language: input.language?.trim() || undefined,
    exportKey: input.exportKey?.trim() || undefined,
  };
}

export function upsertDevCodeLink(node: Node, codeLink: DevCodeLink): Node {
  const existing = node.dev?.codeLinks ?? [];
  const index = existing.findIndex((item) => item.id === codeLink.id);
  const codeLinks = index >= 0 ? existing.map((item) => (item.id === codeLink.id ? codeLink : item)) : [...existing, codeLink];
  return {
    ...node,
    dev: {
      ...node.dev,
      status: node.dev?.status ?? (node.dev?.readyForDev ? "ready" : "draft"),
      codeLinks,
    },
  };
}

export function removeDevCodeLink(node: Node, codeLinkId: string): Node {
  const codeLinks = (node.dev?.codeLinks ?? []).filter((codeLink) => codeLink.id !== codeLinkId);
  return {
    ...node,
    dev: {
      ...node.dev,
      codeLinks,
    },
  };
}

export function setNodeReadyForDev(node: Node, readyForDev: boolean): Node {
  return {
    ...node,
    dev: {
      ...node.dev,
      readyForDev,
      status: readyForDev ? "ready" : "draft",
    },
  };
}

export function buildComponentPlaygroundPreview(
  doc: Doc,
  nodeId: string,
  options?: {
    variantId?: string;
    textProps?: Record<string, string>;
    booleanProps?: Record<string, boolean>;
    instanceProps?: Record<string, string>;
  },
): ComponentPlaygroundPreview | null {
  const sourceNode = doc.nodes[nodeId];
  const component = findComponentSource(doc, nodeId);
  if (!sourceNode || !component) return null;

  const variants = component.variants ?? [];
  const selectedVariantId =
    options?.variantId ??
    (sourceNode.type === "instance" ? sourceNode.variantId : undefined) ??
    variants[0]?.id;
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants[0] ?? null;
  const rootIds =
    selectedVariant?.rootId && doc.nodes[selectedVariant.rootId]
      ? [selectedVariant.rootId]
      : component.children.filter((childId) => Boolean(doc.nodes[childId]));
  if (!rootIds.length) return null;

  const previewDoc = createDoc();
  const pageRootId = previewDoc.pages[0]?.rootId ?? previewDoc.root;
  const pageRoot = previewDoc.nodes[pageRootId];
  if (!pageRoot) return null;

  const visualRoots = rootIds.map((id) => doc.nodes[id]).filter((node): node is Node => Boolean(node));
  const instance = createNode("instance", {
    id: makeRuntimeId("playground"),
    name: `${component.name} Playground`,
    parentId: pageRootId,
    frame: computeBounds(visualRoots),
    instanceOf: component.id,
    sourceId: component.id,
    instanceLibraryId: component.sourceLibraryId,
    variantId: selectedVariant?.id,
    style: { ...component.style, fills: [] },
  });
  instance.children = [];
  previewDoc.nodes[instance.id] = instance;
  pageRoot.children = [...pageRoot.children, instance.id];

  const subtreeIds: string[] = [];
  rootIds.forEach((rootId) => collectSubtree(doc, rootId, subtreeIds));
  const uniqueSubtreeIds = Array.from(new Set(subtreeIds));
  const idMap = new Map<string, string>();
  uniqueSubtreeIds.forEach((oldId) => {
    idMap.set(oldId, makeRuntimeId("playnode"));
  });

  uniqueSubtreeIds.forEach((oldId) => {
    const source = doc.nodes[oldId];
    if (!source) return;
    const next: Node = JSON.parse(JSON.stringify(source)) as Node;
    next.id = idMap.get(oldId) ?? oldId;
    next.parentId = rootIds.includes(oldId) ? instance.id : source.parentId ? idMap.get(source.parentId) ?? instance.id : instance.id;
    next.children = source.children.map((childId) => idMap.get(childId)).filter((childId): childId is string => Boolean(childId));
    next.sourceId = source.sourceId ?? source.id;
    previewDoc.nodes[next.id] = next;
    if (next.parentId === instance.id) {
      instance.children.push(next.id);
    }
  });

  const sourceValueMaps = buildPropertyValueMaps(doc, sourceNode.type === "instance" ? sourceNode : component);
  const textProps = { ...sourceValueMaps.textValues, ...(options?.textProps ?? {}) };
  const booleanProps = { ...sourceValueMaps.booleanValues, ...(options?.booleanProps ?? {}) };
  const instanceProps = { ...sourceValueMaps.instanceValues, ...(options?.instanceProps ?? {}) };

  const clonedNodes = Object.values(previewDoc.nodes).filter((node) => node.parentId === instance.id || node.sourceId);
  const nodeBySourceId = new Map<string, Node>();
  clonedNodes.forEach((node) => {
    if (node.sourceId && !nodeBySourceId.has(node.sourceId)) nodeBySourceId.set(node.sourceId, node);
  });

  const properties: ComponentPlaygroundProperty[] = Object.entries(component.propertyDefinitions ?? {}).map(([sourceId, definition]) => {
    const sourcePropertyNode = doc.nodes[sourceId];
    const previewNode = nodeBySourceId.get(sourceId);
    if (definition.kind === "text") {
      const nextValue = textProps[sourceId] ?? sourcePropertyNode?.text?.value ?? "";
      if (previewNode?.type === "text") previewNode.text = { ...(previewNode.text ?? sourcePropertyNode?.text), value: nextValue } as Node["text"];
      return { sourceId, name: definition.name, kind: definition.kind, textValue: nextValue };
    }
    if (definition.kind === "boolean") {
      const nextValue = booleanProps[sourceId] ?? !sourcePropertyNode?.hidden;
      if (previewNode) previewNode.hidden = !nextValue;
      return { sourceId, name: definition.name, kind: definition.kind, booleanValue: nextValue };
    }
    const nextInstance = instanceProps[sourceId] ?? (previewNode?.type === "instance" ? previewNode.instanceOf : sourcePropertyNode?.type === "instance" ? sourcePropertyNode.instanceOf : "");
    if (previewNode?.type === "instance" && nextInstance) {
      const replacement = doc.nodes[nextInstance];
      previewNode.instanceOf = nextInstance;
      previewNode.sourceId = nextInstance;
      previewNode.name = replacement?.type === "component" ? `${replacement.name} Instance` : previewNode.name;
    }
    return {
      sourceId,
      name: definition.name,
      kind: definition.kind,
      instanceValue: nextInstance || undefined,
      instanceOptions: Object.entries(doc.components)
        .map(([id]) => doc.nodes[id])
        .filter((node): node is Node => Boolean(node && node.type === "component"))
        .map((node) => ({ id: node.id, name: node.name })),
    };
  });

  previewDoc.selection = new Set([instance.id]);
  return {
    doc: previewDoc,
    previewNodeId: instance.id,
    componentId: component.id,
    variantId: selectedVariant?.id,
    variants: variants.map((variant) => ({ id: variant.id, name: variant.name, props: variant.props ? { ...variant.props } : undefined })),
    properties,
  };
}
