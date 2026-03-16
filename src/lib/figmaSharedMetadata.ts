import type { Node, NodeDevHandoff, NodeWidget } from "@/advanced/doc/scene";
import type { FigmaNode } from "./figma";

export const NULL_FIGMA_SHARED_NAMESPACE = "NULL";
export const NULL_FIGMA_SHARED_META_KEY = "meta";

type SharedNodeMetadata = {
  version: 1;
  sourceLibraryId?: string;
  sourceVersionId?: string;
  publishedKey?: string;
  instanceLibraryId?: string;
  sourceId?: string;
  variantId?: string;
  variants?: NonNullable<Node["variants"]>;
  propertyDefinitions?: NonNullable<Node["propertyDefinitions"]>;
  widget?: NodeWidget;
  dev?: NodeDevHandoff;
};

function cloneDev(dev: NodeDevHandoff | undefined) {
  if (!dev) return undefined;
  return {
    ...dev,
    annotations: dev.annotations?.map((annotation) => ({ ...annotation })),
    codeLinks: dev.codeLinks?.map((link) => ({ ...link })),
  } satisfies NodeDevHandoff;
}

function cloneWidget(widget: NodeWidget | undefined) {
  if (!widget) return undefined;
  return {
    ...widget,
    allowedActions: widget.allowedActions ? [...widget.allowedActions] : undefined,
    allowedHosts: widget.allowedHosts ? [...widget.allowedHosts] : undefined,
    allowedScopes: widget.allowedScopes ? [...widget.allowedScopes] : undefined,
    actionScopes: widget.actionScopes
      ? Object.fromEntries(Object.entries(widget.actionScopes).map(([key, value]) => [key, [...value]]))
      : undefined,
  } satisfies NodeWidget;
}

function cloneVariants(variants: NonNullable<Node["variants"]> | undefined) {
  return variants?.map((variant) => ({
    ...variant,
    props: variant.props ? { ...variant.props } : undefined,
  }));
}

function clonePropertyDefinitions(definitions: NonNullable<Node["propertyDefinitions"]> | undefined) {
  return definitions
    ? Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, { ...value }]))
    : undefined;
}

export function buildSharedNodeMetadata(node: Node): SharedNodeMetadata | null {
  const metadata: SharedNodeMetadata = {
    version: 1,
    sourceLibraryId: node.sourceLibraryId,
    sourceVersionId: node.sourceVersionId,
    publishedKey: node.publishedKey,
    instanceLibraryId: node.instanceLibraryId,
    sourceId: node.sourceId,
    variantId: node.variantId,
    variants: cloneVariants(node.variants),
    propertyDefinitions: clonePropertyDefinitions(node.propertyDefinitions),
    widget: cloneWidget(node.widget),
    dev: cloneDev(node.dev),
  };
  const hasAnyValue = Object.entries(metadata).some(([key, value]) => key !== "version" && value !== undefined);
  return hasAnyValue ? metadata : null;
}

export function buildSharedPluginDataForNode(
  node: Node,
  existing?: FigmaNode["sharedPluginData"],
): FigmaNode["sharedPluginData"] | undefined {
  const metadata = buildSharedNodeMetadata(node);
  if (!metadata && !existing) return undefined;
  const namespace = { ...(existing?.[NULL_FIGMA_SHARED_NAMESPACE] ?? {}) };
  if (metadata) {
    namespace[NULL_FIGMA_SHARED_META_KEY] = JSON.stringify(metadata);
  }
  return {
    ...(existing ?? {}),
    [NULL_FIGMA_SHARED_NAMESPACE]: namespace,
  };
}

function parseSharedNodeMetadata(fNode: Pick<FigmaNode, "sharedPluginData">): SharedNodeMetadata | null {
  const raw = fNode.sharedPluginData?.[NULL_FIGMA_SHARED_NAMESPACE]?.[NULL_FIGMA_SHARED_META_KEY];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SharedNodeMetadata;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function applySharedNodeMetadata(node: Node, fNode: Pick<FigmaNode, "sharedPluginData">) {
  const metadata = parseSharedNodeMetadata(fNode);
  if (!metadata) return node;

  if (metadata.sourceLibraryId) node.sourceLibraryId = metadata.sourceLibraryId;
  if (metadata.sourceVersionId) node.sourceVersionId = metadata.sourceVersionId;
  if (metadata.publishedKey) node.publishedKey = metadata.publishedKey;
  if (metadata.instanceLibraryId) node.instanceLibraryId = metadata.instanceLibraryId;
  if (metadata.sourceId) node.sourceId = metadata.sourceId;
  if (metadata.variantId) node.variantId = metadata.variantId;
  if (metadata.variants?.length) node.variants = cloneVariants(metadata.variants);
  if (metadata.propertyDefinitions) node.propertyDefinitions = clonePropertyDefinitions(metadata.propertyDefinitions);
  if (metadata.widget) node.widget = cloneWidget(metadata.widget);
  if (metadata.dev) node.dev = cloneDev(metadata.dev);
  return node;
}
