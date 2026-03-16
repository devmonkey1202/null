import type { Doc, GridAutoLayout, GridChildAlign, GridChildPlacement, GridTrackSizing, LayoutSizingAxis, Node } from "../doc/scene";

type GridPlacement = {
  node: Node;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  sizing: LayoutSizingAxis;
  horizontalAlign: GridChildAlign;
  verticalAlign: GridChildAlign;
};

function clampBy(value: number, min?: number, max?: number) {
  let next = value;
  if (min != null && Number.isFinite(min)) next = Math.max(next, min);
  if (max != null && Number.isFinite(max)) next = Math.min(next, max);
  return next;
}

function sanitizeTrack(track: GridTrackSizing | undefined, fallback: GridTrackSizing): GridTrackSizing {
  if (!track) return { ...fallback };
  if (track.type === "fixed") return { type: "fixed", value: Math.max(1, Number(track.value) || 1) };
  if (track.type === "flex") return { type: "flex", value: Math.max(0.1, Number(track.value) || 1) };
  return { type: "hug" };
}

function fillTrackSizing(values: GridTrackSizing[] | undefined, count: number, fallback: GridTrackSizing): GridTrackSizing[] {
  const safeCount = Math.max(1, count);
  return Array.from({ length: safeCount }, (_, index) => sanitizeTrack(values?.[index], fallback));
}

function parseTrackToken(token: string): GridTrackSizing {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return { type: "flex", value: 1 };
  if (normalized === "auto" || normalized === "hug") return { type: "hug" };
  if (normalized.endsWith("fr")) {
    const value = Number(normalized.slice(0, -2));
    return { type: "flex", value: Math.max(0.1, Number.isFinite(value) ? value : 1) };
  }
  const px = normalized.endsWith("px") ? Number(normalized.slice(0, -2)) : Number(normalized);
  if (Number.isFinite(px)) return { type: "fixed", value: Math.max(1, px) };
  return { type: "flex", value: 1 };
}

export function parseGridTrackSizingInput(value: string | undefined, count: number, fallback: GridTrackSizing): GridTrackSizing[] {
  const tokens = value?.trim().split(/\s+/).filter(Boolean).map(parseTrackToken) ?? [];
  if (!tokens.length) return fillTrackSizing(undefined, count, fallback);
  return Array.from({ length: Math.max(1, count) }, (_, index) => sanitizeTrack(tokens[index] ?? tokens[tokens.length - 1], fallback));
}

export function stringifyGridTrackSizing(values: GridTrackSizing[] | undefined, count: number, fallback: GridTrackSizing): string {
  return fillTrackSizing(values, count, fallback)
    .map((track) => {
      if (track.type === "fixed") return `${Math.max(1, Number(track.value) || 1)}px`;
      if (track.type === "flex") return `${Math.max(0.1, Number(track.value) || 1)}fr`;
      return "auto";
    })
    .join(" ");
}

function resolveGridChildPlacement(node: Node): Required<GridChildPlacement> {
  return {
    row: Math.max(0, node.gridChild?.row ?? 0),
    column: Math.max(0, node.gridChild?.column ?? 0),
    rowSpan: Math.max(1, node.gridChild?.rowSpan ?? 1),
    columnSpan: Math.max(1, node.gridChild?.columnSpan ?? 1),
    horizontalAlign: node.gridChild?.horizontalAlign ?? "auto",
    verticalAlign: node.gridChild?.verticalAlign ?? "auto",
  };
}

function resolveSizing(node: Node): LayoutSizingAxis {
  return node.layoutSizing ?? { width: "fixed", height: "fixed" };
}

function canOccupy(
  occupied: Set<string>,
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
  columnCount: number,
) {
  if (column < 0 || row < 0 || column + columnSpan > columnCount) return false;
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = column; c < column + columnSpan; c += 1) {
      if (occupied.has(`${r}:${c}`)) return false;
    }
  }
  return true;
}

function markOccupied(occupied: Set<string>, row: number, column: number, rowSpan: number, columnSpan: number) {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = column; c < column + columnSpan; c += 1) {
      occupied.add(`${r}:${c}`);
    }
  }
}

function collectGridPlacements(doc: Doc, container: Node, layout: GridAutoLayout) {
  const children = container.children
    .map((id) => doc.nodes[id])
    .filter((node): node is Node => Boolean(node))
    .filter((node) => node.layoutPositioning !== "absolute");
  const occupied = new Set<string>();
  const columnCount = Math.max(1, layout.columns);
  let rowCount = Math.max(1, layout.rows);
  const placements: GridPlacement[] = [];

  const explicit = children.filter((node) => node.gridChild?.row != null || node.gridChild?.column != null);
  const automatic = children.filter((node) => !explicit.includes(node));

  explicit.forEach((node) => {
    const placement = resolveGridChildPlacement(node);
    rowCount = Math.max(rowCount, placement.row + placement.rowSpan);
    if (!canOccupy(occupied, placement.row, placement.column, placement.rowSpan, placement.columnSpan, columnCount)) return;
    markOccupied(occupied, placement.row, placement.column, placement.rowSpan, placement.columnSpan);
    placements.push({
      node,
      row: placement.row,
      column: placement.column,
      rowSpan: placement.rowSpan,
      columnSpan: placement.columnSpan,
      sizing: resolveSizing(node),
      horizontalAlign: placement.horizontalAlign,
      verticalAlign: placement.verticalAlign,
    });
  });

  automatic.forEach((node) => {
    const placement = resolveGridChildPlacement(node);
    let placed = false;
    for (let row = 0; !placed && row < rowCount + automatic.length + 4; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        if (!canOccupy(occupied, row, column, placement.rowSpan, placement.columnSpan, columnCount)) continue;
        markOccupied(occupied, row, column, placement.rowSpan, placement.columnSpan);
        rowCount = Math.max(rowCount, row + placement.rowSpan);
        placements.push({
          node,
          row,
          column,
          rowSpan: placement.rowSpan,
          columnSpan: placement.columnSpan,
          sizing: resolveSizing(node),
          horizontalAlign: placement.horizontalAlign,
          verticalAlign: placement.verticalAlign,
        });
        placed = true;
        break;
      }
    }
  });

  return { placements, rowCount, columnCount };
}

function distributeContentBase(base: number[], tracks: GridTrackSizing[], start: number, span: number, measure: number) {
  const indices = Array.from({ length: span }, (_, offset) => start + offset).filter((index) => tracks[index]);
  const flexible = indices.filter((index) => tracks[index]?.type !== "fixed");
  const targets = flexible.length ? flexible : indices;
  if (!targets.length) return;
  const share = measure / targets.length;
  targets.forEach((index) => {
    base[index] = Math.max(base[index] ?? 0, share);
  });
}

function computeTrackSizes(
  layout: GridAutoLayout,
  placements: GridPlacement[],
  rowCount: number,
  columnCount: number,
  innerWidth: number,
  innerHeight: number,
  hugWidth: boolean,
  hugHeight: boolean,
) {
  const columns = fillTrackSizing(layout.columnsSizing, columnCount, { type: "flex", value: 1 });
  const rows = fillTrackSizing(layout.rowsSizing, rowCount, { type: "hug" });
  const columnBase = columns.map((track) => (track.type === "fixed" ? Math.max(1, Number(track.value) || 1) : 0));
  const rowBase = rows.map((track) => (track.type === "fixed" ? Math.max(1, Number(track.value) || 1) : 0));

  placements.forEach((placement) => {
    const width = clampBy(placement.node.frame.w, placement.sizing.minWidth, placement.sizing.maxWidth);
    const height = clampBy(placement.node.frame.h, placement.sizing.minHeight, placement.sizing.maxHeight);
    distributeContentBase(columnBase, columns, placement.column, placement.columnSpan, width);
    distributeContentBase(rowBase, rows, placement.row, placement.rowSpan, height);
  });

  const columnGap = Math.max(0, layout.columnGap);
  const rowGap = Math.max(0, layout.rowGap);
  const availableWidth = Math.max(0, innerWidth - columnGap * Math.max(0, columnCount - 1));
  const availableHeight = Math.max(0, innerHeight - rowGap * Math.max(0, rowCount - 1));
  const fixedWidth = columnBase.reduce((sum, current, index) => sum + (columns[index]?.type === "fixed" ? current : columns[index]?.type === "hug" ? current : 0), 0);
  const fixedHeight = rowBase.reduce((sum, current, index) => sum + (rows[index]?.type === "fixed" ? current : rows[index]?.type === "hug" ? current : 0), 0);
  const flexWidthUnits = columns.reduce((sum, track) => sum + (track.type === "flex" ? Math.max(0.1, Number(track.value) || 1) : 0), 0);
  const flexHeightUnits = rows.reduce((sum, track) => sum + (track.type === "flex" ? Math.max(0.1, Number(track.value) || 1) : 0), 0);
  const flexWidthUnit = !hugWidth && flexWidthUnits > 0 ? Math.max(0, availableWidth - fixedWidth) / flexWidthUnits : 0;
  const flexHeightUnit = !hugHeight && flexHeightUnits > 0 ? Math.max(0, availableHeight - fixedHeight) / flexHeightUnits : 0;

  const columnSizes = columns.map((track, index) => {
    if (track.type === "fixed") return columnBase[index] ?? Math.max(1, Number(track.value) || 1);
    if (track.type === "hug") return Math.max(1, columnBase[index] ?? 0);
    return Math.max(columnBase[index] ?? 0, flexWidthUnit * Math.max(0.1, Number(track.value) || 1));
  });
  const rowSizes = rows.map((track, index) => {
    if (track.type === "fixed") return rowBase[index] ?? Math.max(1, Number(track.value) || 1);
    if (track.type === "hug") return Math.max(1, rowBase[index] ?? 0);
    return Math.max(rowBase[index] ?? 0, flexHeightUnit * Math.max(0.1, Number(track.value) || 1));
  });

  return { columns, rows, columnSizes, rowSizes };
}

function buildOffsets(trackSizes: number[], gap: number, start: number) {
  const offsets: number[] = [];
  let cursor = start;
  trackSizes.forEach((size, index) => {
    offsets[index] = cursor;
    cursor += size + (index < trackSizes.length - 1 ? gap : 0);
  });
  return offsets;
}

function resolveAlignedPosition(origin: number, available: number, size: number, align: GridChildAlign, fill: boolean) {
  if (fill || align === "auto" || align === "start") return origin;
  if (align === "center") return origin + Math.max(0, available - size) / 2;
  if (align === "end") return origin + Math.max(0, available - size);
  return origin;
}

export function applyGridLayout(doc: Doc, container: Node) {
  if (container.layout?.mode !== "grid") return false;
  const layout = container.layout;
  const padding = layout.padding;
  const innerWidth = Math.max(0, container.frame.w - padding.l - padding.r);
  const innerHeight = Math.max(0, container.frame.h - padding.t - padding.b);
  const sizing = resolveSizing(container);
  const hugWidth = sizing.width === "hug";
  const hugHeight = sizing.height === "hug";
  const { placements, rowCount, columnCount } = collectGridPlacements(doc, container, layout);
  const { columns, rows, columnSizes, rowSizes } = computeTrackSizes(
    layout,
    placements,
    rowCount,
    columnCount,
    innerWidth,
    innerHeight,
    hugWidth,
    hugHeight,
  );

  const columnOffsets = buildOffsets(columnSizes, layout.columnGap, padding.l);
  const rowOffsets = buildOffsets(rowSizes, layout.rowGap, padding.t);

  placements.forEach((placement) => {
    const cellX = columnOffsets[placement.column] ?? padding.l;
    const cellY = rowOffsets[placement.row] ?? padding.t;
    const areaWidth =
      columnSizes.slice(placement.column, placement.column + placement.columnSpan).reduce((sum, current) => sum + current, 0)
      + layout.columnGap * Math.max(0, placement.columnSpan - 1);
    const areaHeight =
      rowSizes.slice(placement.row, placement.row + placement.rowSpan).reduce((sum, current) => sum + current, 0)
      + layout.rowGap * Math.max(0, placement.rowSpan - 1);
    const fillWidth = placement.sizing.width === "fill";
    const fillHeight = placement.sizing.height === "fill";
    const width = clampBy(fillWidth ? areaWidth : placement.node.frame.w, placement.sizing.minWidth, placement.sizing.maxWidth);
    const height = clampBy(fillHeight ? areaHeight : placement.node.frame.h, placement.sizing.minHeight, placement.sizing.maxHeight);
    placement.node.frame = {
      ...placement.node.frame,
      x: resolveAlignedPosition(cellX, areaWidth, Math.min(areaWidth, Math.max(1, width)), placement.horizontalAlign, fillWidth),
      y: resolveAlignedPosition(cellY, areaHeight, Math.min(areaHeight, Math.max(1, height)), placement.verticalAlign, fillHeight),
      w: Math.max(1, fillWidth ? areaWidth : Math.min(areaWidth, width)),
      h: Math.max(1, fillHeight ? areaHeight : Math.min(areaHeight, height)),
    };
  });

  let changed = false;
  const desiredWidth = padding.l + padding.r + columnSizes.reduce((sum, current) => sum + current, 0) + layout.columnGap * Math.max(0, columnSizes.length - 1);
  const desiredHeight = padding.t + padding.b + rowSizes.reduce((sum, current) => sum + current, 0) + layout.rowGap * Math.max(0, rowSizes.length - 1);
  if (hugWidth && Math.abs(container.frame.w - desiredWidth) > 0.5) {
    container.frame.w = Math.max(1, desiredWidth);
    changed = true;
  }
  if (hugHeight && Math.abs(container.frame.h - desiredHeight) > 0.5) {
    container.frame.h = Math.max(1, desiredHeight);
    changed = true;
  }

  container.layout.columnsSizing = columns;
  container.layout.rowsSizing = rows;
  if (container.layout.rows < rowCount) {
    container.layout.rows = rowCount;
  }

  return changed;
}
