import type { Doc } from "../doc/scene";

export type LayoutConflict = { id: string; area: number };

function getAbsoluteFrame(doc: Doc, nodeId: string) {
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

export function findLayoutConflicts(doc: Doc, targetId: string): LayoutConflict[] {
  const target = doc.nodes[targetId];
  if (!target || !target.parentId) return [];
  const targetAbs = getAbsoluteFrame(doc, targetId);
  if (!targetAbs) return [];
  const parent = doc.nodes[target.parentId];
  if (!parent) return [];
  const conflicts: LayoutConflict[] = [];
  parent.children
    .filter((id) => id !== targetId)
    .forEach((id) => {
      const node = doc.nodes[id];
      if (!node || node.hidden) return;
      const rect = getAbsoluteFrame(doc, id);
      if (!rect) return;
      const x1 = Math.max(targetAbs.x, rect.x);
      const y1 = Math.max(targetAbs.y, rect.y);
      const x2 = Math.min(targetAbs.x + targetAbs.w, rect.x + rect.w);
      const y2 = Math.min(targetAbs.y + targetAbs.h, rect.y + rect.h);
      if (x2 <= x1 || y2 <= y1) return;
      const area = Math.round((x2 - x1) * (y2 - y1));
      conflicts.push({ id, area });
    });
  return conflicts.sort((a, b) => b.area - a.area);
}
