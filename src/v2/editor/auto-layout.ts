import type { AutoLayoutData } from "./contracts";

export const DEFAULT_AUTO_LAYOUT: Required<AutoLayoutData> = {
  direction: "vertical",
  gap: 16,
  paddingX: 24,
  paddingY: 24,
  align: "start",
  justify: "start",
  wrap: false,
  wrapGap: 16,
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

  return {
    ...DEFAULT_AUTO_LAYOUT,
    ...layout,
    gap,
    wrap: Boolean(layout.wrap),
    wrapGap,
  };
}
