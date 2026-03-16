import type { Doc } from "../doc/scene";

export function getAbsoluteFrame(doc: Doc, nodeId: string) {
  const node = doc.nodes[nodeId];
  if (!node) return null;
  let x = node.frame.x;
  let y = node.frame.y;
  let current = node.parentId ? doc.nodes[node.parentId] : null;
  while (current) {
    x += current.frame.x;
    y += current.frame.y;
    current = current.parentId ? doc.nodes[current.parentId] : null;
  }
  return { x, y, w: node.frame.w, h: node.frame.h };
}

export function hitTest(doc: Doc, x: number, y: number, rootId: string) {
  const ordered: string[] = [];
  const walk = (id: string) => {
    const node = doc.nodes[id];
    if (!node) return;
    node.children.forEach((childId) => {
      ordered.push(childId);
      walk(childId);
    });
  };
  walk(rootId);

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const id = ordered[i];
    const node = doc.nodes[id];
    if (!node || node.hidden || node.locked) continue;
    const rect = getAbsoluteFrame(doc, id);
    if (!rect) continue;
    if (x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h) return id;
  }
  return null;
}

export function snap(value: number, grid = 8) {
  return Math.round(value / grid) * grid;
}
