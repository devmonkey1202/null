import { cloneDoc } from "../doc/scene";
import type { AutoLayout, Doc, Frame, LayoutSizingAxis, Node } from "../doc/scene";
import { getTextLineMetrics } from "../geom/textLayout";
import { applyGridLayout } from "./autoLayoutGrid";
import { resolveGuideAwareConstraints } from "./constraintGuideResolution";

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

type AutoLayoutLine = {
  items: LayoutItem[];
  cross: number;
  main: number;
};

const DEFAULT_AUTO_LAYOUT: AutoLayout = {
  mode: "auto",
  dir: "row",
  gap: 8,
  justify: "start",
  padding: { t: 16, r: 16, b: 16, l: 16 },
  align: "start",
  wrap: false,
  wrapGap: 8,
  wrapAlign: "start",
};

function normalizeAutoLayout(layout?: AutoLayout): AutoLayout {
  if (!layout || layout.mode !== "auto") return { ...DEFAULT_AUTO_LAYOUT };
  const align = layout.align ?? "start";
  return {
    mode: "auto",
    dir: layout.dir ?? "row",
    gap: Number.isFinite(layout.gap) ? layout.gap : 8,
    gapMode: layout.gapMode ?? "fixed",
    justify: layout.justify ?? ((layout.gapMode ?? "fixed") === "space-between" ? "space-between" : "start"),
    padding: {
      t: Number.isFinite(layout.padding?.t) ? layout.padding.t : 16,
      r: Number.isFinite(layout.padding?.r) ? layout.padding.r : 16,
      b: Number.isFinite(layout.padding?.b) ? layout.padding.b : 16,
      l: Number.isFinite(layout.padding?.l) ? layout.padding.l : 16,
    },
    align: layout.dir === "column" && align === "baseline" ? "start" : align,
    wrap: Boolean(layout.wrap),
    wrapGap: Number.isFinite(layout.wrapGap) ? layout.wrapGap : (Number.isFinite(layout.gap) ? layout.gap : 8),
    wrapAlign: layout.wrapAlign ?? "start",
    includeStrokeInBounds: Boolean(layout.includeStrokeInBounds),
  };
}

function clampBy(value: number, min?: number, max?: number) {
  let next = value;
  if (min != null && Number.isFinite(min)) next = Math.max(next, min);
  if (max != null && Number.isFinite(max)) next = Math.min(next, max);
  return next;
}

function getStrokeInset(node: Node, includeStroke: boolean): number {
  if (!includeStroke || !node.style?.strokes?.length) return 0;
  const maxW = Math.max(...node.style.strokes.map((s) => s.width ?? 0), 0);
  const align = node.style.strokes[0]?.align ?? "center";
  if (align === "outside") return maxW;
  if (align === "inside") return 0;
  return Math.ceil(maxW / 2);
}

function suppressHugForOverflowAxis(node: Node, axis: "width" | "height") {
  const overflow = node.overflowScrolling ?? "none";
  if (axis === "width") return overflow === "horizontal" || overflow === "both";
  return overflow === "vertical" || overflow === "both";
}

function isIgnoredAutoLayoutChild(node: Node) {
  return node.layoutPositioning === "absolute";
}

function collectLayoutItems(doc: Doc, container: Node, includeStroke: boolean): LayoutItem[] {
  return container.children
    .map((id) => doc.nodes[id])
    .filter((node): node is Node => Boolean(node))
    .filter((node) => !isIgnoredAutoLayoutChild(node))
    .map((node) => {
      const inset = getStrokeInset(node, includeStroke);
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
}

function getItemAxisSize(
  item: LayoutItem,
  isRow: boolean,
  axis: "main" | "cross",
  options?: { fillAsCurrent?: boolean },
) {
  const mainMode = isRow ? item.sizing.width : item.sizing.height;
  const crossMode = isRow ? item.sizing.height : item.sizing.width;
  const mainBase = isRow ? item.layoutWidth : item.layoutHeight;
  const crossBase = isRow ? item.layoutHeight : item.layoutWidth;

  if (axis === "main") {
    const base = mainMode === "fill"
      ? options?.fillAsCurrent
        ? mainBase
        : 0
      : mainBase;
    return {
      mode: mainMode,
      size: clampBy(
        base,
        isRow ? item.sizing.minWidth : item.sizing.minHeight,
        isRow ? item.sizing.maxWidth : item.sizing.maxHeight,
      ),
    };
  }

  return {
    mode: crossMode,
    size: clampBy(
      crossBase,
      isRow ? item.sizing.minHeight : item.sizing.minWidth,
      isRow ? item.sizing.maxHeight : item.sizing.maxWidth,
    ),
  };
}

function getBaselineOffset(item: LayoutItem) {
  if (item.node.type === "text") {
    return item.strokeInset + getTextLineMetrics(item.node.text?.style ?? {}).baselineOffset;
  }
  return Math.max(0, item.height - item.strokeInset);
}

function buildAutoLayoutLines(
  items: LayoutItem[],
  layout: AutoLayout,
  isRow: boolean,
  availableMain: number,
  options?: { fillAsCurrent?: boolean },
): AutoLayoutLine[] {
  const lines: AutoLayoutLine[] = [];
  let line: AutoLayoutLine = { items: [], cross: 0, main: 0 };

  items.forEach((item) => {
    const main = getItemAxisSize(item, isRow, "main", options).size;
    const cross = getItemAxisSize(item, isRow, "cross").size;
    const nextMain = line.items.length ? line.main + layout.gap + main : main;

    if (layout.wrap && line.items.length && nextMain > availableMain) {
      lines.push(line);
      line = { items: [], cross: 0, main: 0 };
    }

    line.items.push(item);
    line.cross = Math.max(line.cross, cross);
    line.main = line.items.length === 1 ? main : line.main + layout.gap + main;
  });

  if (line.items.length) lines.push(line);
  return lines;
}

function resolveSizing(node: Node): LayoutSizingAxis {
  return node.layoutSizing ?? { width: "fixed", height: "fixed" };
}

export function applyConstraintsOnResize(doc: Doc, parentId: string, prevFrame: Frame, nextFrame: Frame): Doc {
  if (prevFrame.w === nextFrame.w && prevFrame.h === nextFrame.h) return doc;
  const parent = doc.nodes[parentId];
  if (!parent || !parent.children.length) return doc;
  const parentIsAutoLayout = parent.layout?.mode === "auto";

  const next = cloneDoc(doc);
  const nextParent = next.nodes[parentId];
  if (!nextParent) return doc;

  nextParent.frame = { ...nextParent.frame, ...nextFrame };

  parent.children.forEach((childId) => {
    const original = doc.nodes[childId];
    const child = next.nodes[childId];
    if (!original || !child) return;
    if (parentIsAutoLayout && !isIgnoredAutoLayoutChild(original)) return;
    const constraints = original.constraints ?? {};
    const resolved = resolveGuideAwareConstraints(parent, original, prevFrame, nextFrame, constraints);
    const x = resolved.x;
    const y = resolved.y;
    const w = resolved.w;
    const h = resolved.h;

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
  const items = collectLayoutItems(doc, container, includeStroke);

  if (!items.length) return;
  const lines = buildAutoLayoutLines(items, layout, isRow, availableMain, { fillAsCurrent: layout.wrap });

  const mainStart = isRow ? padding.l : padding.t;
  const totalCross = lines.reduce((sum, current) => sum + current.cross, 0)
    + (layout.wrap ? (layout.wrapGap ?? layout.gap) * Math.max(0, lines.length - 1) : 0);
  const remainingCross = Math.max(0, availableCross - totalCross);
  const wrapGap = layout.wrapGap ?? layout.gap;
  const crossGap =
    layout.wrap && layout.wrapAlign === "space-between" && lines.length > 1
      ? Math.max(0, remainingCross / (lines.length - 1))
      : wrapGap;
  let crossOffset = (isRow ? padding.t : padding.l)
    + (
      layout.wrap
        ? layout.wrapAlign === "center"
          ? remainingCross / 2
          : layout.wrapAlign === "end"
            ? remainingCross
            : 0
        : 0
    );

  lines.forEach((current) => {
    let fixedMain = 0;
    let fillCount = 0;

    current.items.forEach((item) => {
      const { mode: mainMode, size: mainSize } = getItemAxisSize(item, isRow, "main");
      if (mainMode === "fill") fillCount += 1;
      else fixedMain += mainSize;
    });

    const baseGap = layout.gap;
    const totalGap = baseGap * Math.max(0, current.items.length - 1);
    const leftover = Math.max(0, availableMain - fixedMain - totalGap);
    const fillSize = fillCount ? leftover / fillCount : 0;
    const justify = layout.justify ?? ((layout.gapMode ?? "fixed") === "space-between" ? "space-between" : "start");
    const gapBetween =
      justify === "space-between" && current.items.length > 1 && fillCount === 0
        ? Math.max(0, (availableMain - fixedMain) / (current.items.length - 1))
        : baseGap;
    const lineCross = layout.wrap ? current.cross : availableCross;
    const resolvedItems = current.items.map((item) => {
      const { mode: mainMode, size: clampedMain } = getItemAxisSize(item, isRow, "main");
      const { mode: crossMode, size: clampedCross } = getItemAxisSize(item, isRow, "cross");
      const layoutMain = mainMode === "fill" ? fillSize : clampedMain;
      const layoutCross = clampedCross;
      const contentW = item.width;
      const contentH = item.height;
      const inset = item.strokeInset;
      const stretchedCross = (layout.align === "stretch" || crossMode === "fill") ? lineCross : layoutCross;
      let w = isRow ? (mainMode === "fill" ? Math.max(1, layoutMain) : contentW) : (crossMode === "fill" ? Math.max(1, stretchedCross) : contentW);
      let h = isRow ? (crossMode === "fill" ? Math.max(1, stretchedCross) : contentH) : (mainMode === "fill" ? Math.max(1, layoutMain) : contentH);
      w = clampBy(w, item.sizing.minWidth, item.sizing.maxWidth);
      h = clampBy(h, item.sizing.minHeight, item.sizing.maxHeight);
      return {
        item,
        mainMode,
        crossMode,
        layoutMain,
        layoutCross,
        inset,
        crossSize: stretchedCross,
        width: w,
        height: h,
        actualMain: isRow ? w : h,
        actualCross: isRow ? h : w,
      };
    });
    const occupiedMain = resolvedItems.reduce((sum, resolved) => sum + resolved.actualMain, 0)
      + gapBetween * Math.max(0, resolvedItems.length - 1);
    const remainingMain = Math.max(0, availableMain - occupiedMain);

    let mainOffset = mainStart
      + (
        justify === "center"
          ? remainingMain / 2
          : justify === "end"
            ? remainingMain
            : 0
      );
    const isBaseline = layout.align === "baseline" && isRow;
    const lineBaseline = isBaseline
      ? resolvedItems.reduce((max, resolved) => Math.max(max, getBaselineOffset(resolved.item)), 0)
      : 0;

    resolvedItems.forEach((resolved) => {
      const { item, mainMode, crossMode, layoutCross, inset, width: w, height: h, actualCross, actualMain } = resolved;
      let cellX: number;
      let cellY: number;
      if (isRow) {
        cellX = mainOffset + (mainMode === "fill" ? 0 : inset);
        if (isBaseline) {
          const baselineY = crossOffset + lineBaseline;
          cellY = baselineY - getBaselineOffset(item);
        } else if (layout.align === "center") {
          cellY = crossOffset + (lineCross - (crossMode === "fill" ? actualCross : layoutCross)) / 2 + (crossMode === "fill" ? 0 : inset);
        } else if (layout.align === "end") {
          cellY = crossOffset + lineCross - (crossMode === "fill" ? actualCross : layoutCross) - (crossMode === "fill" ? 0 : inset);
        } else {
          cellY = crossOffset + (crossMode === "fill" ? 0 : inset);
        }
      } else {
        cellY = mainOffset + (mainMode === "fill" ? 0 : inset);
        if (layout.align === "center") {
          cellX = crossOffset + (lineCross - (crossMode === "fill" ? actualCross : layoutCross)) / 2 + (crossMode === "fill" ? 0 : inset);
        } else if (layout.align === "end") {
          cellX = crossOffset + lineCross - (crossMode === "fill" ? actualCross : layoutCross) - (crossMode === "fill" ? 0 : inset);
        } else {
          cellX = crossOffset + (crossMode === "fill" ? 0 : inset);
        }
      }

      if (isRow) {
        item.node.frame = { ...item.node.frame, x: cellX, y: cellY, w: Math.max(1, w), h: Math.max(1, h) };
      } else {
        item.node.frame = { ...item.node.frame, x: cellX, y: cellY, w: Math.max(1, w), h: Math.max(1, h) };
      }

      mainOffset += actualMain + gapBetween;
    });

    crossOffset += lineCross + (layout.wrap ? crossGap : 0);
  });
}

function applyAutoLayoutHug(doc: Doc, container: Node) {
  const sizing = resolveSizing(container);
  const hugWidth = sizing.width === "hug" && !suppressHugForOverflowAxis(container, "width");
  const hugHeight = sizing.height === "hug" && !suppressHugForOverflowAxis(container, "height");
  if (!hugWidth && !hugHeight) return false;
  const layout = normalizeAutoLayout(container.layout?.mode === "auto" ? container.layout : undefined);

  const isRow = layout.dir === "row";
  const padding = layout.padding;
  const includeStroke = Boolean(layout.includeStrokeInBounds);
  const items = collectLayoutItems(doc, container, includeStroke);
  const mainPadding = isRow ? padding.l + padding.r : padding.t + padding.b;
  const currentAvailableMain = Math.max(0, (isRow ? container.frame.w : container.frame.h) - mainPadding);
  const hugMain = isRow ? hugWidth : hugHeight;
  const lineAvailableMain = layout.wrap && !hugMain ? currentAvailableMain : Number.POSITIVE_INFINITY;
  const lines = items.length
    ? buildAutoLayoutLines(items, layout, isRow, lineAvailableMain, { fillAsCurrent: true })
    : [];
  const measuredMain = lines.length ? Math.max(...lines.map((line) => line.main)) : 0;
  const measuredCross = lines.length
    ? lines.reduce((sum, line) => sum + line.cross, 0) + (layout.wrap ? (layout.wrapGap ?? layout.gap) * Math.max(0, lines.length - 1) : 0)
    : 0;

  const desiredWidth = isRow ? padding.l + padding.r + measuredMain : padding.l + padding.r + measuredCross;
  const desiredHeight = isRow ? padding.t + padding.b + measuredCross : padding.t + padding.b + measuredMain;

  let changed = false;
  if (hugWidth && Math.abs(container.frame.w - desiredWidth) > 0.5) {
    container.frame.w = Math.max(1, desiredWidth);
    changed = true;
  }
  if (hugHeight && Math.abs(container.frame.h - desiredHeight) > 0.5) {
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
  } else if (node.layout?.mode === "grid") {
    const gridChanged = applyGridLayout(doc, node);
    if (gridChanged) {
      applyGridLayout(doc, node);
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
