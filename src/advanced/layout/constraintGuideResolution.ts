import type { Constraints, Frame, LayoutGridItem, Node } from "../doc/scene";

type AxisGuide = { origin: number; size: number };

function inferGuideAlignment(item: Extract<LayoutGridItem, { type: "columns" | "rows" }>) {
  if (item.alignment) return item.alignment;
  if (item.type === "columns") return item.width != null ? "start" : "stretch";
  return item.height != null ? "start" : "stretch";
}

function buildAxisGuides(
  item: Extract<LayoutGridItem, { type: "columns" | "rows" }>,
  axisSize: number,
): AxisGuide[] {
  const count = Math.max(1, item.count ?? 1);
  const gutter = Math.max(0, item.gutter ?? 0);
  const offset = Math.max(0, item.offset ?? 0);
  const alignment = inferGuideAlignment(item);
  const fixedSize = item.type === "columns" ? item.width : item.height;
  const size =
    fixedSize != null
      ? Math.max(1, fixedSize)
      : Math.max(1, (axisSize - offset * 2 - gutter * Math.max(0, count - 1)) / count);
  const total = size * count + gutter * Math.max(0, count - 1);
  const start =
    alignment === "center"
      ? Math.max(0, (axisSize - total) / 2)
      : offset;
  return Array.from({ length: count }, (_, index) => ({
    origin: start + index * (size + gutter),
    size,
  }));
}

function pickGuide(guides: AxisGuide[], center: number): AxisGuide | null {
  if (!guides.length) return null;
  let best = guides[0] ?? null;
  let bestDistance = Number.POSITIVE_INFINITY;
  guides.forEach((guide) => {
    const guideCenter = guide.origin + guide.size / 2;
    const distance = Math.abs(guideCenter - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = guide;
    }
  });
  return best;
}

function resolveAxisGuide(
  parent: Node,
  child: Node,
  prevSize: number,
  nextSize: number,
  axis: "horizontal" | "vertical",
): { prev: AxisGuide; next: AxisGuide } | null {
  const items = (parent.layoutGrid ?? []).filter((item): item is Extract<LayoutGridItem, { type: "columns" | "rows" }> =>
    axis === "horizontal" ? item.type === "columns" : item.type === "rows",
  );
  const stretchGuide = items.find((item) => inferGuideAlignment(item) === "stretch");
  if (!stretchGuide) return null;
  const center = axis === "horizontal"
    ? child.frame.x + child.frame.w / 2
    : child.frame.y + child.frame.h / 2;
  const prevGuide = pickGuide(buildAxisGuides(stretchGuide, prevSize), center);
  const nextGuide = pickGuide(buildAxisGuides(stretchGuide, nextSize), center);
  if (!prevGuide || !nextGuide) return null;
  return { prev: prevGuide, next: nextGuide };
}

function resolveAxisConstraint(
  start: number,
  size: number,
  prevGuide: AxisGuide,
  nextGuide: AxisGuide,
  flags: { min: boolean; max: boolean; center: boolean; scale: boolean },
) {
  let nextStart = start;
  let nextSizeValue = size;
  const localStart = start - prevGuide.origin;

  if (flags.scale && prevGuide.size > 0) {
    const ratio = nextGuide.size / prevGuide.size;
    nextStart = nextGuide.origin + localStart * ratio;
    nextSizeValue = size * ratio;
  } else if (flags.min && flags.max) {
    const minOffset = localStart;
    const maxOffset = prevGuide.size - (localStart + size);
    nextStart = nextGuide.origin + minOffset;
    nextSizeValue = Math.max(1, nextGuide.size - minOffset - maxOffset);
  } else if (flags.min) {
    nextStart = nextGuide.origin + localStart;
  } else if (flags.max) {
    const maxOffset = prevGuide.size - (localStart + size);
    nextStart = nextGuide.origin + nextGuide.size - maxOffset - size;
  } else if (flags.center) {
    const centerOffset = localStart + size / 2 - prevGuide.size / 2;
    nextStart = nextGuide.origin + nextGuide.size / 2 + centerOffset - size / 2;
  }

  return { start: nextStart, size: Math.max(1, nextSizeValue) };
}

export function resolveGuideAwareConstraints(
  parent: Node,
  child: Node,
  prevFrame: Frame,
  nextFrame: Frame,
  constraints: Constraints,
) {
  const horizontalGuide = resolveAxisGuide(parent, child, prevFrame.w, nextFrame.w, "horizontal");
  const verticalGuide = resolveAxisGuide(parent, child, prevFrame.h, nextFrame.h, "vertical");
  const horizontal = resolveAxisConstraint(
    child.frame.x,
    child.frame.w,
    horizontalGuide?.prev ?? { origin: 0, size: prevFrame.w },
    horizontalGuide?.next ?? { origin: 0, size: nextFrame.w },
    {
      min: Boolean(constraints.left),
      max: Boolean(constraints.right),
      center: Boolean(constraints.hCenter),
      scale: Boolean(constraints.scaleX),
    },
  );
  const vertical = resolveAxisConstraint(
    child.frame.y,
    child.frame.h,
    verticalGuide?.prev ?? { origin: 0, size: prevFrame.h },
    verticalGuide?.next ?? { origin: 0, size: nextFrame.h },
    {
      min: Boolean(constraints.top),
      max: Boolean(constraints.bottom),
      center: Boolean(constraints.vCenter),
      scale: Boolean(constraints.scaleY),
    },
  );
  return {
    x: horizontal.start,
    y: vertical.start,
    w: horizontal.size,
    h: vertical.size,
    usedGuides: Boolean(horizontalGuide || verticalGuide),
  };
}
