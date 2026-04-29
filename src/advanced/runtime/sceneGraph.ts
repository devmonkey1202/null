"use client";

import type { Doc, Node, SerializableDoc } from "../doc/scene";
import { hydrateDoc } from "../doc/scene";
import { getAbsoluteFrame } from "../geom/geom";
import { layoutDoc } from "../layout/engine";
import { getPageContentBounds } from "./bounds";

export type RuntimeRendererMode = "svg" | "canvas-prototype";

export type RuntimeSceneGraph = {
  hydrated: Doc;
  laidOut: Doc;
  pageId: string | null;
  pageRootIds: string[];
  width: number;
  height: number;
  svgWidth: number;
  svgHeight: number;
  viewBox: string;
  fitContent: boolean;
  orderedNodeIds: string[];
  nodeCount: number;
  effectNodeCount: number;
  widgetNodeCount: number;
  unsupportedCanvasNodeIds: string[];
};

export type RuntimeRendererModeDecision = {
  mode: RuntimeRendererMode;
  reason:
    | "forced-svg"
    | "forced-canvas"
    | "interactive-fallback"
    | "unsupported-node-fallback"
    | "threshold-not-met"
    | "svg-default"
    | "canvas-large-doc";
};

type BuildRuntimeSceneGraphOptions = {
  activePageId?: string;
  fitToContent?: boolean;
};

type PickRuntimeRendererModeOptions = {
  requestedMode?: "auto" | RuntimeRendererMode;
  interactive?: boolean;
  preferCanvasStage?: boolean;
  canvasThreshold?: number;
};

function isCanvasPrototypeUnsupportedNode(node: Node) {
  return node.type === "video" || node.type === "table" || node.type === "hotspot" || Boolean(node.widget);
}

function collectOrderedNodeIds(doc: Doc, rootIds: string[]) {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = doc.nodes[id];
    if (!node || node.hidden) return;
    ordered.push(id);
    node.children.forEach(walk);
  };
  rootIds.forEach(walk);
  return ordered;
}

export function buildRuntimeSceneGraph(doc: Doc | SerializableDoc, options: BuildRuntimeSceneGraphOptions = {}): RuntimeSceneGraph {
  const hydrated = hydrateDoc(doc);
  const laidOut = layoutDoc(hydrated);

  const preferredPageId = options.activePageId ?? laidOut.prototype?.startPageId;
  const page = preferredPageId ? laidOut.pages.find((item) => item.id === preferredPageId) ?? laidOut.pages[0] : laidOut.pages[0];

  // Editor pages may be spread across a large infinite canvas. Runtime/public view should
  // render the active page in its own local viewport, so normalize the selected page root
  // back to the origin without mutating the original layout result.
  const runtimeDoc: Doc = {
    ...laidOut,
    pages: laidOut.pages.map((item) => ({ ...item })),
    nodes: Object.fromEntries(
      Object.entries(laidOut.nodes).map(([id, node]) => [
        id,
        {
          ...node,
          frame: { ...node.frame },
          children: [...node.children],
          style: {
            ...node.style,
            fills: [...(node.style.fills ?? [])],
            strokes: [...(node.style.strokes ?? [])],
            effects: [...(node.style.effects ?? [])],
          },
        },
      ]),
    ),
  };

  const pageNode = page ? runtimeDoc.nodes[page.rootId] : null;
  if (pageNode) {
    pageNode.frame = { ...pageNode.frame, x: 0, y: 0 };
  }

  const pageRootIds = pageNode ? [pageNode.id] : runtimeDoc.nodes[runtimeDoc.root]?.children ?? [];
  const width = pageNode?.frame.w ?? 1200;
  const height = pageNode?.frame.h ?? 800;
  const bounds = getPageContentBounds(runtimeDoc, page?.id ?? null);
  const resolvedBounds = bounds && bounds.w > 0 && bounds.h > 0 ? bounds : null;
  const hasContent = Boolean(pageNode?.children?.length);
  const isLargeCanvas = Boolean(pageNode && (pageNode.frame.w >= 2400 || pageNode.frame.h >= 1800));
  const fitContent = Boolean(resolvedBounds && (options.fitToContent || (isLargeCanvas && hasContent)));
  const minX = resolvedBounds ? Math.min(0, resolvedBounds.x) : 0;
  const minY = resolvedBounds ? Math.min(0, resolvedBounds.y) : 0;
  const maxX = resolvedBounds ? Math.max(width, resolvedBounds.x + resolvedBounds.w) : width;
  const maxY = resolvedBounds ? Math.max(height, resolvedBounds.y + resolvedBounds.h) : height;
  const extendedWidth = maxX - minX;
  const extendedHeight = maxY - minY;
  const svgWidth = fitContent && resolvedBounds ? resolvedBounds.w : extendedWidth;
  const svgHeight = fitContent && resolvedBounds ? resolvedBounds.h : extendedHeight;
  const viewBox = fitContent && resolvedBounds
    ? `${resolvedBounds.x} ${resolvedBounds.y} ${resolvedBounds.w} ${resolvedBounds.h}`
    : `${minX} ${minY} ${extendedWidth} ${extendedHeight}`;

  const orderedNodeIds = collectOrderedNodeIds(runtimeDoc, pageRootIds);
  const effectNodeCount = orderedNodeIds.filter((id) => (runtimeDoc.nodes[id]?.style.effects?.length ?? 0) > 0).length;
  const widgetNodeCount = orderedNodeIds.filter((id) => Boolean(runtimeDoc.nodes[id]?.widget)).length;
  const unsupportedCanvasNodeIds = orderedNodeIds.filter((id) => {
    const node = runtimeDoc.nodes[id];
    return node ? isCanvasPrototypeUnsupportedNode(node) : false;
  });

  return {
    hydrated,
    laidOut: runtimeDoc,
    pageId: page?.id ?? null,
    pageRootIds,
    width,
    height,
    svgWidth,
    svgHeight,
    viewBox,
    fitContent,
    orderedNodeIds,
    nodeCount: orderedNodeIds.length,
    effectNodeCount,
    widgetNodeCount,
    unsupportedCanvasNodeIds,
  };
}

export function pickRuntimeRendererMode(
  scene: RuntimeSceneGraph,
  options: PickRuntimeRendererModeOptions = {},
): RuntimeRendererModeDecision {
  const requestedMode = options.requestedMode ?? "auto";
  const interactive = Boolean(options.interactive);
  const preferCanvasStage = Boolean(options.preferCanvasStage);
  const canvasThreshold = Math.max(500, options.canvasThreshold ?? 5000);
  const hasUnsupportedCanvasNodes = scene.unsupportedCanvasNodeIds.length > 0;

  if (requestedMode === "svg") {
    return { mode: "svg", reason: "forced-svg" };
  }
  if (requestedMode === "canvas-prototype") {
    if (interactive) return { mode: "svg", reason: "interactive-fallback" };
    if (hasUnsupportedCanvasNodes) return { mode: "svg", reason: "unsupported-node-fallback" };
    return { mode: "canvas-prototype", reason: "forced-canvas" };
  }
  if (interactive) {
    return { mode: "svg", reason: "interactive-fallback" };
  }
  if (!preferCanvasStage) {
    return { mode: "svg", reason: "svg-default" };
  }
  if (scene.nodeCount < canvasThreshold) {
    return { mode: "svg", reason: "threshold-not-met" };
  }
  if (hasUnsupportedCanvasNodes) {
    return { mode: "svg", reason: "unsupported-node-fallback" };
  }
  return { mode: "canvas-prototype", reason: "canvas-large-doc" };
}

export function buildCanvasPrototypeSnapshot(scene: RuntimeSceneGraph) {
  return scene.orderedNodeIds
    .map((id) => {
      const node = scene.laidOut.nodes[id];
      const abs = getAbsoluteFrame(scene.laidOut, id);
      if (!node || !abs) return null;
      return {
        id,
        type: node.type,
        frame: abs,
        rotation: node.frame.rotation,
        opacity: node.style.opacity,
        fill: node.style.fills?.[0],
        stroke: node.style.strokes?.[0],
        text: node.type === "text" ? node.text?.value ?? "" : "",
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}
