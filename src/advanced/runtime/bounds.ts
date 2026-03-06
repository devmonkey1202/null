import type { Doc } from "../doc/scene";

export type Bounds = { x: number; y: number; w: number; h: number };

function unionBounds(a: Bounds | null, b: Bounds | null) {
  if (!a) return b;
  if (!b) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function rotatePoint(x: number, y: number, cx: number, cy: number, radians: number) {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

function rectBounds(x: number, y: number, w: number, h: number, rotation: number) {
  if (!rotation) return { x, y, w, h };
  const radians = (rotation * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const points = [
    rotatePoint(x, y, cx, cy, radians),
    rotatePoint(x + w, y, cx, cy, radians),
    rotatePoint(x, y + h, cx, cy, radians),
    rotatePoint(x + w, y + h, cx, cy, radians),
  ];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function getNodeBounds(doc: Doc, nodeId: string, parentX: number, parentY: number): Bounds | null {
  const node = doc.nodes[nodeId];
  if (!node || node.hidden) return null;
  const absX = parentX + node.frame.x;
  const absY = parentY + node.frame.y;
  let bounds: Bounds | null = rectBounds(absX, absY, node.frame.w, node.frame.h, node.frame.rotation);

  node.children.forEach((childId) => {
    bounds = unionBounds(bounds, getNodeBounds(doc, childId, absX, absY));
  });

  return bounds;
}

export function getPageBounds(doc: Doc, pageId?: string | null) {
  const page =
    Array.isArray(doc.pages) && doc.pages.length
      ? pageId
        ? doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
        : doc.pages[0]
      : null;
  const rootIds = page ? [page.rootId] : doc.nodes[doc.root]?.children ?? [];
  let bounds: Bounds | null = null;
  rootIds.forEach((id) => {
    bounds = unionBounds(bounds, getNodeBounds(doc, id, 0, 0));
  });
  return bounds;
}

export function getPageContentBounds(doc: Doc, pageId?: string | null): Bounds | null {
  const page =
    Array.isArray(doc.pages) && doc.pages.length
      ? pageId
        ? doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
        : doc.pages[0]
      : null;
  const rootId = page?.rootId ?? null;
  const root = rootId ? doc.nodes[rootId] : null;
  const childIds = root?.children ?? [];
  let bounds: Bounds | null = null;
  childIds.forEach((id) => {
    bounds = unionBounds(bounds, getNodeBounds(doc, id, 0, 0));
  });
  return bounds ?? getPageBounds(doc, pageId);
}

  /** Returns bounds of all descendants in local node space (node local origin at 0,0). */
function getNodeBoundsLocal(doc: Doc, nodeId: string): Bounds {
  const node = doc.nodes[nodeId];
  if (!node || node.hidden) return { x: 0, y: 0, w: 0, h: 0 };
  const f = node.frame;
  let bounds: Bounds = { x: 0, y: 0, w: f.w, h: f.h };
  node.children.forEach((childId) => {
    const child = doc.nodes[childId];
    if (!child || child.hidden) return;
    const childLocal = getNodeBoundsLocal(doc, childId);
    const translated: Bounds = {
      x: child.frame.x + childLocal.x,
      y: child.frame.y + childLocal.y,
      w: childLocal.w,
      h: childLocal.h,
    };
    bounds = unionBounds(bounds, translated)!;
  });
  return bounds;
}

  /** Bounds of direct children (and their descendants) in parent-local coordinates. */
export function getNodeChildrenBounds(doc: Doc, nodeId: string): Bounds {
  const node = doc.nodes[nodeId];
  if (!node || node.hidden || !node.children.length) return { x: 0, y: 0, w: 0, h: 0 };
  let bounds: Bounds | null = null;
  node.children.forEach((childId) => {
    const child = doc.nodes[childId];
    if (!child || child.hidden) return;
    const childLocal = getNodeBoundsLocal(doc, childId);
    const inParent: Bounds = {
      x: child.frame.x + childLocal.x,
      y: child.frame.y + childLocal.y,
      w: childLocal.w,
      h: childLocal.h,
    };
    bounds = unionBounds(bounds, inParent);
  });
  return bounds ?? { x: 0, y: 0, w: 0, h: 0 };
}
