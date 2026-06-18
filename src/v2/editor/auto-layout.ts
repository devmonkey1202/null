import type { AutoLayoutData, LayoutSizingAxis } from "./contracts";

export const DEFAULT_AUTO_LAYOUT: Required<AutoLayoutData> = {
  direction: "vertical",
  gap: 16,
  paddingX: 24,
  paddingY: 24,
  align: "start",
  justify: "start",
  gapMode: "fixed",
  wrap: false,
  wrapGap: 16,
  wrapAlign: "start",
};

export const DEFAULT_LAYOUT_SIZING: LayoutSizingAxis = {
  width: "fixed",
  height: "fixed",
};

export function resolveAutoLayout(layout?: AutoLayoutData | null): Required<AutoLayoutData> | null {
  if (!layout) {
    return null;
  }

  const gap = typeof layout.gap === "number" && Number.isFinite(layout.gap)
    ? layout.gap
    : DEFAULT_AUTO_LAYOUT.gap;
  const wrapGap = typeof layout.wrapGap === "number" && Number.isFinite(layout.wrapGap)
    ? layout.wrapGap
    : gap;
  const gapMode = layout.gapMode === "space_between" || layout.justify === "space_between"
    ? "space_between"
    : DEFAULT_AUTO_LAYOUT.gapMode;
  const justify = gapMode === "space_between"
    ? "space_between"
    : layout.justify && layout.justify !== "space_between"
      ? layout.justify
      : DEFAULT_AUTO_LAYOUT.justify;
  const align = layout.direction === "vertical" && layout.align === "baseline"
    ? "start"
    : layout.align ?? DEFAULT_AUTO_LAYOUT.align;

  return {
    ...DEFAULT_AUTO_LAYOUT,
    ...layout,
    gap,
    align,
    justify,
    gapMode,
    wrap: Boolean(layout.wrap),
    wrapGap,
    wrapAlign: layout.wrapAlign ?? DEFAULT_AUTO_LAYOUT.wrapAlign,
  };
}

export function resolveLayoutSizing(sizing?: LayoutSizingAxis | null): LayoutSizingAxis {
  if (!sizing) {
    return { ...DEFAULT_LAYOUT_SIZING };
  }

  return {
    ...DEFAULT_LAYOUT_SIZING,
    ...sizing,
  };
}
