import type { GridAutoLayout, GridChildPlacement, LayoutMode } from "../doc/scene";
import { parseGridTrackSizingInput, stringifyGridTrackSizing } from "../layout/autoLayoutGrid";
import { DEFAULT_GRID_LAYOUT } from "./AdvancedEditor.constants";

export function ensureGridLayout(layout?: LayoutMode): GridAutoLayout {
  if (layout?.mode === "grid") return layout;
  return {
    ...DEFAULT_GRID_LAYOUT,
    padding: { ...DEFAULT_GRID_LAYOUT.padding },
    columnsSizing: DEFAULT_GRID_LAYOUT.columnsSizing?.map((track) => ({ ...track })),
    rowsSizing: DEFAULT_GRID_LAYOUT.rowsSizing?.map((track) => ({ ...track })),
  };
}

export function ensureGridChildPlacement(gridChild?: GridChildPlacement): Required<GridChildPlacement> {
  return {
    row: Math.max(0, gridChild?.row ?? 0),
    column: Math.max(0, gridChild?.column ?? 0),
    rowSpan: Math.max(1, gridChild?.rowSpan ?? 1),
    columnSpan: Math.max(1, gridChild?.columnSpan ?? 1),
    horizontalAlign: gridChild?.horizontalAlign ?? "auto",
    verticalAlign: gridChild?.verticalAlign ?? "auto",
  };
}

export function updateGridTrackSizing(
  layout: GridAutoLayout,
  axis: "columns" | "rows",
  rawValue: string,
): GridAutoLayout {
  if (axis === "columns") {
    return {
      ...layout,
      columnsSizing: parseGridTrackSizingInput(rawValue, Math.max(1, layout.columns), { type: "flex", value: 1 }),
    };
  }
  return {
    ...layout,
    rowsSizing: parseGridTrackSizingInput(rawValue, Math.max(1, layout.rows), { type: "hug" }),
  };
}

export function describeGridTrackSizing(layout: GridAutoLayout, axis: "columns" | "rows"): string {
  if (axis === "columns") {
    return stringifyGridTrackSizing(layout.columnsSizing, Math.max(1, layout.columns), { type: "flex", value: 1 });
  }
  return stringifyGridTrackSizing(layout.rowsSizing, Math.max(1, layout.rows), { type: "hug" });
}
