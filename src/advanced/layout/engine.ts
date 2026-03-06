import { cloneDoc } from "../doc/scene";
import type { AutoLayout, Doc, Frame, LayoutSizingAxis, Node } from "../doc/scene";

type LayoutItem = {
  node: Node;
  width: number;
  height: number;
  /** Layout bounds size (may include stroke width beyond node width/height). */
  layoutWidth: number;
  layoutHeight: number;
  strokeInset: number;
  sizing: LayoutSizingAxis;
};

const DEFAULT_AUTO_LAYOUT: AutoLayout = {
  mode: "auto",
  dir: "row",
  gap: 8,
  padding: { t: 16, r: 16, b: 16, l: 16 },
  align: "start",
  wrap: false,
};

function normalizeAutoLayout(layout?: AutoLayout): AutoLayout {
  if (!layout || layout.mode !== "auto") return { ...DEFAULT_AUTO_LAYOUT };
  const align = layout.align ?? "start";
  return {
    mode: "auto",
    dir: layout.dir ?? "row",
    gap: Number.isFinite(layout.gap) ? layout.gap : 8,
    gapMode: layout.gapMode ?? "fixed",
    padding: {
      t: Number.isFinite(layout.padding?.t) ? layout.padding.t : 16,
      r: Number.isFinite(layout.padding?.r) ? layout.padding.r : 16,
      b: Number.isFinite(layout.padding?.b) ? layout.padding.b : 16,
      l: Number.isFinite(layout.padding?.l) ? layout.padding.l : 16,
    },
    align: layout.dir === "column" && align === "baseline" ? "start" : align,
    wrap: Boolean(layout.wrap),
    includeStrokeInBounds: Boolean(layout.includeStrokeInBounds),
  };
}

function resolveSizing(node: Node): LayoutSizingAxis {
  return node.layoutSizing ?? { width: "fixed", height: "fixed" };
}

export function applyConstraintsOnResize(doc: Doc, parentId: string, prevFrame: Frame, nextFrame: Frame): Doc {
  if (prevFrame.w === nextFrame.w && prevFrame.h === nextFrame.h) return doc;
  const parent = doc.nodes[parentId];
  if (!parent || !parent.children.length) return doc;

  const next = cloneDoc(doc);
  const nextParent = next.nodes[parentId];
  if (!nextParent) return doc;

  nextParent.frame = { ...nextParent.frame, ...nextFrame };

  parent.children.forEach((childId) => {
    const original = doc.nodes[childId];
    const child = next.nodes[childId];
    if (!original || !child) return;
    const constraints = original.constraints ?? {};
    let x = original.frame.x;
    let y = original.frame.y;
    let w = original.frame.w;
    let h = original.frame.h;

    if (constraints.scaleX && prevFrame.w > 0) {
      const ratio = nextFrame.w / prevFrame.w;
      x *= ratio;
      w *= ratio;
    } else {
      const left = Boolean(constraints.left);
      const right = Boolean(constraints.right);
      const hCenter = Boolean(constraints.hCenter);
      if (left && right) {
        const leftOffset = original.frame.x;
        const rightOffset = prevFrame.w - (original.frame.x + original.frame.w);
        x = leftOffset;
        w = Math.max(1, nextFrame.w - leftOffset - rightOffset);
      } else if (left) {
        x = original.frame.x;
      } else if (right) {
        const rightOffset = prevFrame.w - (original.frame.x + original.frame.w);
        x = nextFrame.w - rightOffset - original.frame.w;
      } else if (hCenter) {
        const centerOffset = original.frame.x + original.frame.w / 2 - prevFrame.w / 2;
        x = nextFrame.w / 2 + centerOffset - original.frame.w / 2;
      }
    }

    if (constraints.scaleY && prevFrame.h > 0) {
      const ratio = nextFrame.h / prevFrame.h;
      y *= ratio;
      h *= ratio;
    } else {
      const top = Boolean(constraints.top);
      const bottom = Boolean(constraints.bottom);
      const vCenter = Boolean(constraints.vCenter);
      if (top && bottom) {
        const topOffset = original.frame.y;
        const bottomOffset = prevFrame.h - (original.frame.y + original.frame.h);
        y = topOffset;
        h = Math.max(1, nextFrame.h - topOffset - bottomOffset);
      } else if (top) {
        y = original.frame.y;
      } else if (bottom) {
        const bottomOffset = prevFrame.h - (original.frame.y + original.frame.h);
        y = nextFrame.h - bottomOffset - original.frame.h;
      } else if (vCenter) {
        const centerOffset = original.frame.y + original.frame.h / 2 - prevFrame.h / 2;
        y = nextFrame.h / 2 + centerOffset - original.frame.h / 2;
      }
    }

    child.frame = { ...child.frame, x, y, w, h };
  });

  return next;
}

function applyAutoLayout(doc: Doc, container: Node) {
  const layout = normalizeAutoLayout(container.layout?.mode === "auto" ? container.layout : undefined);
  const isRow = layout.dir === "row";
  const padding = layout.padding;
  const availableMain = Math.max(0, (isRow ? container.frame.w : container.frame.h) - (isRow ? padding.l + padding.r : padding.t + padding.b));
  const availableCross = Math.max(0, (isRow ? container.frame.h : container.frame.w) - (isRow ? padding.t + padding.b : padding.l + padding.r));

  const includeStroke = Boolean(layout.includeStrokeInBounds);
  const strokeInset = (node: Node): number => {
    if (!includeStroke || !node.style?.strokes?.length) return 0;
    const maxW = Math.max(...node.style.strokes.map((s) => s.width ?? 0), 0);
    const align = node.style.strokes[0]?.align ?? "center";
    if (align === "outside") return maxW;
    if (align === "inside") return 0;
    return Math.ceil(maxW / 2);
  };

  const items: LayoutItem[] = container.children
    .map((id) => doc.nodes[id])
    .filter((node): node is Node => Boolean(node))
    .map((node) => {
      const inset = strokeInset(node);
      const w = Math.max(0, node.frame.w + (includeStroke ? inset * 2 : 0));
      const h = Math.max(0, node.frame.h + (includeStroke ? inset * 2 : 0));
      return {
        node,
        width: w,
        height: h,
        layoutWidth: w,
        layoutHeight: h,
        strokeInset: inset,
        sizing: resolveSizing(node),
      };
    });

  if (!items.length) return;

  type Line = { items: LayoutItem[]; cross: number };
  const lines: Line[] = [];
  let line: Line = { items: [], cross: 0 };

  items.forEach((item) => {
    const mainMode = isRow ? item.sizing.width : item.sizing.height;
    const mainSize = mainMode === "fill" ? 0 : isRow ? item.layoutWidth : item.layoutHeight;
    const crossSize = isRow ? item.layoutHeight : item.layoutWidth;
    const gap = line.items.length ? layout.gap : 0;
    const nextMain = line.items.length ? line.items.reduce((sum, it) => {
      const mode = isRow ? it.sizing.width : it.sizing.height;
      const size = mode === "fill" ? 0 : isRow ? it.layoutWidth : it.layoutHeight;
      return sum + size;
    }, 0) + layout.gap * line.items.length + mainSize : mainSize;

    if (layout.wrap && line.items.length && nextMain > availableMain) {
      lines.push(line);
      line = { items: [], cross: 0 };
    }

    line.items.push(item);
    line.cross = Math.max(line.cross, crossSize);
  });

  if (line.items.length) lines.push(line);

  let crossOffset = isRow ? padding.t : padding.l;
  const mainStart = isRow ? padding.l : padding.t;

  lines.forEach((current) => {
    let fixedMain = 0;
    let fillCount = 0;

    current.items.forEach((item) => {
      const mainMode = isRow ? item.sizing.width : item.sizing.height;
      const mainSize = mainMode === "fill" ? 0 : isRow ? item.layoutWidth : item.layoutHeight;
      if (mainMode === "fill") fillCount += 1;
      else fixedMain += mainSize;
    });

    const gapMode = layout.gapMode ?? "fixed";
    const totalGap = gapMode === "space-between" && current.items.length > 1
      ? 0
      : layout.gap * Math.max(0, current.items.length - 1);
    const leftover = Math.max(0, availableMain - fixedMain - totalGap);
    const fillSize = fillCount ? leftover / fillCount : 0;
    const gapBetween = gapMode === "space-between" && current.items.length > 1
      ? Math.max(0, (availableMain - fixedMain - fillCount * fillSize) / (current.items.length - 1))
      : layout.gap;
    const lineCross = layout.wrap ? current.cross : availableCross;

    let mainOffset = mainStart;
    const isBaseline = layout.align === "baseline" && isRow;

    const clampBy = (val: number, min?: number, max?: number) => {
      if (min != null && Number.isFinite(min)) val = Math.max(val, min);
      if (max != null && Number.isFinite(max)) val = Math.min(val, max);
      return val;
    };

    current.items.forEach((item) => {
      const mainMode = isRow ? item.sizing.width : item.sizing.height;
      const crossMode = isRow ? item.sizing.height : item.sizing.width;
      let layoutMain = mainMode === "fill" ? fillSize : isRow ? item.layoutWidth : item.layoutHeight;
      let layoutCross = isRow ? item.layoutHeight : item.layoutWidth;
      layoutMain = clampBy(layoutMain, isRow ? item.sizing.minWidth : item.sizing.minHeight, isRow ? item.sizing.maxWidth : item.sizing.maxHeight);
      layoutCross = clampBy(layoutCross, isRow ? item.sizing.minHeight : item.sizing.minWidth, isRow ? item.sizing.maxHeight : item.sizing.maxWidth);
      const contentW = item.width;
      const contentH = item.height;
      const inset = item.strokeInset;

      const crossSize = (layout.align === "stretch" || crossMode === "fill") ? lineCross : layoutCross;
      let w = isRow ? (mainMode === "fill" ? Math.max(1, layoutMain) : contentW) : (crossMode === "fill" ? Math.max(1, crossSize) : contentW);
      let h = isRow ? (crossMode === "fill" ? Math.max(1, crossSize) : contentH) : (mainMode === "fill" ? Math.max(1, layoutMain) : contentH);
      w = clampBy(w, item.sizing.minWidth, item.sizing.maxWidth);
      h = clampBy(h, item.sizing.minHeight, item.sizing.maxHeight);

      let cellX: number;
      let cellY: number;
      if (isRow) {
        cellX = mainOffset + (mainMode === "fill" ? 0 : inset);
        if (isBaseline) {
          const baselineRatio = 0.8;
          const baselineY = crossOffset + lineCross * baselineRatio;
          cellY = baselineY - contentH * baselineRatio;
        } else if (layout.align === "center") {
          cellY = crossOffset + (lineCross - (crossMode === "fill" ? crossSize : layoutCross)) / 2 + (crossMode === "fill" ? 0 : inset);
        } else if (layout.align === "end") {
          cellY = crossOffset + lineCross - (crossMode === "fill" ? crossSize : layoutCross) - (crossMode === "fill" ? 0 : inset);
        } else {
          cellY = crossOffset + (crossMode === "fill" ? 0 : inset);
        }
      } else {
        cellY = mainOffset + (mainMode === "fill" ? 0 : inset);
        if (layout.align === "center") {
          cellX = crossOffset + (lineCross - (crossMode === "fill" ? crossSize : layoutCross)) / 2 + (crossMode === "fill" ? 0 : inset);
        } else if (layout.align === "end") {
          cellX = crossOffset + lineCross - (crossMode === "fill" ? crossSize : layoutCross) - (crossMode === "fill" ? 0 : inset);
        } else {
          cellX = crossOffset + (crossMode === "fill" ? 0 : inset);
        }
      }

      if (isRow) {
        item.node.frame = { ...item.node.frame, x: cellX, y: cellY, w: Math.max(1, w), h: Math.max(1, h) };
      } else {
        item.node.frame = { ...item.node.frame, x: cellX, y: cellY, w: Math.max(1, w), h: Math.max(1, h) };
      }

      mainOffset += layoutMain + gapBetween;
    });

    crossOffset += lineCross + (layout.wrap ? layout.gap : 0);
  });
}

function applyAutoLayoutHug(doc: Doc, container: Node) {
  const sizing = resolveSizing(container);
  if (sizing.width !== "hug" && sizing.height !== "hug") return false;
  const layout = normalizeAutoLayout(container.layout?.mode === "auto" ? container.layout : undefined);
  if (layout.wrap) return false;

  const isRow = layout.dir === "row";
  const padding = layout.padding;
  const includeStroke = Boolean(layout.includeStrokeInBounds);
  const strokeInset = (node: Node): number => {
    if (!includeStroke || !node.style?.strokes?.length) return 0;
    const maxW = Math.max(...node.style.strokes.map((s) => s.width ?? 0), 0);
    const align = node.style.strokes[0]?.align ?? "center";
    if (align === "outside") return maxW;
    if (align === "inside") return 0;
    return Math.ceil(maxW / 2);
  };

  const items = container.children
    .map((id) => doc.nodes[id])
    .filter((node): node is Node => Boolean(node));

  const hasItems = items.length > 0;
  const mainSizes = items.map((item) => {
    const inset = strokeInset(item);
    const w = item.frame.w + (includeStroke ? inset * 2 : 0);
    const h = item.frame.h + (includeStroke ? inset * 2 : 0);
    return isRow ? w : h;
  });
  const crossSizes = items.map((item) => {
    const inset = strokeInset(item);
    const w = item.frame.w + (includeStroke ? inset * 2 : 0);
    const h = item.frame.h + (includeStroke ? inset * 2 : 0);
    return isRow ? h : w;
  });
  const mainTotal = hasItems ? mainSizes.reduce((sum, size) => sum + size, 0) + layout.gap * Math.max(0, items.length - 1) : 0;
  const crossMax = hasItems ? Math.max(...crossSizes) : 0;

  const desiredWidth = isRow ? padding.l + padding.r + mainTotal : padding.l + padding.r + crossMax;
  const desiredHeight = isRow ? padding.t + padding.b + crossMax : padding.t + padding.b + mainTotal;

  let changed = false;
  if (sizing.width === "hug" && Math.abs(container.frame.w - desiredWidth) > 0.5) {
    container.frame.w = Math.max(1, desiredWidth);
    changed = true;
  }
  if (sizing.height === "hug" && Math.abs(container.frame.h - desiredHeight) > 0.5) {
    container.frame.h = Math.max(1, desiredHeight);
    changed = true;
  }
  return changed;
}

function layoutNode(doc: Doc, nodeId: string) {
  const node = doc.nodes[nodeId];
  if (!node) return;
  const pw = node.frame.w;
  const ph = node.frame.h;
  node.children.forEach((childId) => {
    const child = doc.nodes[childId];
    if (!child) return;
    if (child.widthPercent != null && Number.isFinite(child.widthPercent)) {
      child.frame = { ...child.frame, w: Math.max(1, (pw * child.widthPercent) / 100) };
    }
    if (child.heightPercent != null && Number.isFinite(child.heightPercent)) {
      child.frame = { ...child.frame, h: Math.max(1, (ph * child.heightPercent) / 100) };
    }
  });
  node.children.forEach((childId) => layoutNode(doc, childId));
  if (node.layout?.mode === "auto") {
    applyAutoLayout(doc, node);
    if (applyAutoLayoutHug(doc, node)) {
      applyAutoLayout(doc, node);
    }
  }
  if (node.type === "table" && node.table?.columns) {
    applyTableLayout(doc, node);
  }
}

  /** Table layout: place children into a columns x rows grid. */
function applyTableLayout(doc: Doc, node: Node) {
  const cols = Math.max(1, Math.round(node.table!.columns));
  const childIds = node.children.filter((id) => doc.nodes[id]);
  const rowCount = Math.max(1, Math.ceil(childIds.length / cols));
  const cellW = Math.max(1, node.frame.w / cols);
  const cellH = Math.max(1, node.frame.h / rowCount);
  childIds.forEach((childId, i) => {
    const child = doc.nodes[childId];
    if (!child) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    child.frame = {
      ...child.frame,
      x: col * cellW,
      y: row * cellH,
      w: cellW,
      h: cellH,
    };
  });
}

export function layoutDoc(doc: Doc): Doc {
  const next = cloneDoc(doc);
  layoutNode(next, next.root);
  return next;
}
