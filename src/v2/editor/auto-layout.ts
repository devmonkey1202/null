import type { AutoLayoutData, LayoutSizingAxis } from "./contracts";

export type ResolvedAutoLayoutData = AutoLayoutData & {
  gapMode: NonNullable<AutoLayoutData["gapMode"]>;
  wrap: boolean;
  wrapGap: number;
  wrapAlign: NonNullable<AutoLayoutData["wrapAlign"]>;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
};

export const DEFAULT_AUTO_LAYOUT: ResolvedAutoLayoutData = {
  direction: "vertical",
  gap: 16,
  paddingX: 24,
  paddingY: 24,
  paddingTop: 24,
  paddingRight: 24,
  paddingBottom: 24,
  paddingLeft: 24,
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

export function resolveAutoLayout(layout?: AutoLayoutData | null): ResolvedAutoLayoutData | null {
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
  const paddingX = typeof layout.paddingX === "number" && Number.isFinite(layout.paddingX)
    ? layout.paddingX
    : DEFAULT_AUTO_LAYOUT.paddingX;
  const paddingY = typeof layout.paddingY === "number" && Number.isFinite(layout.paddingY)
    ? layout.paddingY
    : DEFAULT_AUTO_LAYOUT.paddingY;
  const paddingTop = typeof layout.paddingTop === "number" && Number.isFinite(layout.paddingTop)
    ? layout.paddingTop
    : paddingY;
  const paddingRight = typeof layout.paddingRight === "number" && Number.isFinite(layout.paddingRight)
    ? layout.paddingRight
    : paddingX;
  const paddingBottom = typeof layout.paddingBottom === "number" && Number.isFinite(layout.paddingBottom)
    ? layout.paddingBottom
    : paddingY;
  const paddingLeft = typeof layout.paddingLeft === "number" && Number.isFinite(layout.paddingLeft)
    ? layout.paddingLeft
    : paddingX;

  return {
    ...DEFAULT_AUTO_LAYOUT,
    ...layout,
    gap,
    paddingX,
    paddingY,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
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
