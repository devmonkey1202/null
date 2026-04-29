import type { Doc } from "../doc/scene";
import { getAbsoluteFrame } from "../geom/geom";
import type { Rect } from "./AdvancedEditor.types";

export type CanvasPoint = { x: number; y: number };

export type MinimapNode = {
  id: string;
  rect: Rect;
  selected: boolean;
};

export type MinimapModel = {
  bounds: Rect;
  viewport: Rect;
  nodes: MinimapNode[];
  selectionBounds: Rect | null;
};

type HitOptions = {
  excludeIds?: Set<string>;
  includeLocked?: boolean;
  includeHidden?: boolean;
};

function flattenIds(doc: Doc, parentId: string): string[] {
  const parent = doc.nodes[parentId];
  if (!parent) return [];
  const out: string[] = [];
  parent.children.forEach((id) => {
    out.push(id);
    out.push(...flattenIds(doc, id));
  });
  return out;
}

function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
}

export function getNodeIdsAtPoint(doc: Doc, pageRoot: string, point: CanvasPoint, options: HitOptions = {}) {
  const ids = flattenIds(doc, pageRoot).filter((id) => id !== pageRoot && !options.excludeIds?.has(id));
  const hits: string[] = [];
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const id = ids[index];
    const node = doc.nodes[id];
    if (!node) continue;
    if (!options.includeHidden && node.hidden) continue;
    if (!options.includeLocked && node.locked) continue;
    const rect = getAbsoluteFrame(doc, id);
    if (!rect) continue;
    if (point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h) {
      hits.push(id);
    }
  }
  return hits;
}

export function getNextDeepSelectionId(hits: string[], currentId: string | null) {
  if (!hits.length) return null;
  if (!currentId) return hits[0];
  const currentIndex = hits.indexOf(currentId);
  if (currentIndex < 0) return hits[0];
  return hits[(currentIndex + 1) % hits.length];
}

export function buildMinimapModel(doc: Doc, pageRoot: string, viewportRect: Rect, selection: Set<string>): MinimapModel | null {
  const nodeRects = flattenIds(doc, pageRoot)
    .filter((id) => id !== pageRoot)
    .map((id) => {
      const node = doc.nodes[id];
      const rect = getAbsoluteFrame(doc, id);
      if (!node || !rect || node.hidden) return null;
      return { id, rect, selected: selection.has(id) };
    })
    .filter((item): item is MinimapNode => Boolean(item));

  const pageRect = getAbsoluteFrame(doc, pageRoot);
  const selectionRects = Array.from(selection)
    .map((id) => getAbsoluteFrame(doc, id))
    .filter((rect): rect is Rect => Boolean(rect));
  const selectionBounds = unionRects(selectionRects);

  const fallbackBounds = unionRects([
    ...nodeRects.map((item) => item.rect),
    viewportRect,
    ...(selectionBounds ? [selectionBounds] : []),
  ]);
  const bounds = pageRect && pageRect.w > 0 && pageRect.h > 0 ? pageRect : fallbackBounds ? expandRect(fallbackBounds, 120) : null;
  if (!bounds) return null;

  return {
    bounds,
    viewport: viewportRect,
    nodes: nodeRects,
    selectionBounds,
  };
}

export function projectRectToMinimap(rect: Rect, bounds: Rect, width: number, height: number, padding = 8) {
  const scale = Math.min((width - padding * 2) / bounds.w, (height - padding * 2) / bounds.h);
  const contentWidth = bounds.w * scale;
  const contentHeight = bounds.h * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;
  return {
    x: offsetX + (rect.x - bounds.x) * scale,
    y: offsetY + (rect.y - bounds.y) * scale,
    w: rect.w * scale,
    h: rect.h * scale,
  };
}

export function minimapPointToCanvas(local: { x: number; y: number }, bounds: Rect, width: number, height: number, padding = 8) {
  const scale = Math.min((width - padding * 2) / bounds.w, (height - padding * 2) / bounds.h);
  const contentWidth = bounds.w * scale;
  const contentHeight = bounds.h * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;
  return {
    x: bounds.x + (local.x - offsetX) / scale,
    y: bounds.y + (local.y - offsetY) / scale,
  };
}
